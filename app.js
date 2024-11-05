const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const blessed = require('blessed');
const QRCode = require('qrcode-terminal');
const os = require('os');

let hotspotIp;

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let name in interfaces) {
    for (let iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        hotspotIp = iface.address;
        return;
      }
    }
  }
}

getLocalIP();

const server = https.createServer({
  cert: fs.readFileSync('server.crt'),
  key: fs.readFileSync('server.key')
}, (req, res) => {
  const parsedUrl = url.parse(req.url);
  let filePath = '.' + parsedUrl.pathname;

  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.svg': 'application/image/svg+xml'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code == 'ENOENT') {
        fs.readFile('./404.html', (err, content) => {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end(content, 'utf-8');
        });
      } else {
        res.writeHead(500);
        res.end(`Sorry, there was an error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const screen = blessed.screen({
  smartCSR: true
});

screen.title = 'WebSocket Server';

const header = blessed.box({
  top: '0',
  left: '0',
  width: '100%',
  height: '20%',
  style: {
    fg: 'white',
    bg: 'red'
  }
});

const qrInstruction = blessed.text({
  content: 'Press "p" to toggle QR Code',
  top: '10%',
  left: '0',
  width: '30%',
  height: '30%',
  style: {
    fg: 'white',
    bg: 'black'
  }
});


const banner = blessed.box({
  top: '50%', 
  left: 'center',
  width: '50%',
  height: 'shrink', 
  content: 'RidersTT\nScan QrCode to Connect\nRidersTermuxTalk SERVER',
  style: {
    fg: 'white', 
    bg: 'red', 
    bold: true, 
  },
});
;

header.append(qrInstruction);
header.append(banner);
screen.append(header);
screen.render();

const userBox = blessed.list({
  label: 'Connected Users',
  top: '20%',
  left: '0',
  width: '50%',
  height: '30%',
  border: { type: 'line' },
  style: {
    bold:true,
    fg:'red',
    border: { fg: 'red' }
  },
padding: {
    top: 1,
    bottom: 1,
    left: 2,
    right: 2,
  }
});

const messageBox = blessed.log({
  label: 'Messages',
  top: '50%',
  left: '0',
  width: '100%',
  height: '50%',
  border: { type: 'line' },
  style: {
    bold:true,
    fg:'red',
    border: { fg: 'red' }
  },
padding: {
    top: 1,
    bottom: 1,
    left: 2,
    right: 2,
  }
});

const statusBox = blessed.box({
  label: 'Server Status',
  top: '20%',
  left: '50%',
  width: '50%',
  height: '30%',
  border: { type: 'line' },
  style: {
    bold:true,
    fg:'red',
    border: { fg: 'red' }
  },

   padding: {
    top: 1,   
    bottom: 1, 
    left: 2,   
    right: 2,  
  }
});

screen.append(userBox);
screen.append(messageBox);
screen.append(statusBox);
screen.render();

const wss = new WebSocket.Server({ server });

let users = {};
let isQrCodeVisible = false;

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    switch (data.type) {
      case 'login':
        ws.username = data.name;
        users[ws.username] = ws;
        updateUsers();
        logMessage(`User ${ws.username} logged in`);
        break;
      case 'offer':
      case 'answer':
      case 'iceCandidate':
        if (users[data.to]) {
          users[data.to].send(JSON.stringify(data));
        }
        break;
      case 'chatMessage':
        broadcast(JSON.stringify(data), users[data.from]);
        logMessage(`${data.from}: ${data.message}`);
        break;
     case 'speed':
        broadcast(JSON.stringify(data), users[data.from]);
        logMessage(`${data.from}: ${data.speed}`);
        break;


      case 'quit':
        logMessage(`User ${ws.username} quit`);
        delete users[ws.username];
        updateUsers();
        break;
      case 'endCall':
        if (users[data.to]) {
          users[data.to].send(JSON.stringify(data));
        }
        logMessage(`Call ended by ${ws.username}`);
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    logMessage(`User ${ws.username} disconnected`);
    delete users[ws.username];
    updateUsers();
  });

  function updateUsers() {
    const userList = Object.keys(users);
    userBox.clearItems();
    userList.forEach((user) => {
broadcast(JSON.stringify({ type: 'updateUserList', users: userList }));
      userBox.addItem(user);
    });
    screen.render();
  }

  function broadcast(message, sender = null) {
    Object.values(users).forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client !== sender) {
        client.send(message);
      }
    });
  }

  function logMessage(message) {
    messageBox.log(message);
    screen.render();
  }
});

screen.key(['p'], () => {
  if (isQrCodeVisible) {
    isQrCodeVisible = false;
    console.clear();
    console.log('QR Code hidden');
  } else {
    QRCode.generate(`https://${hotspotIp}:8443`, { small: true }, (qrcode) => {
      console.clear();
      console.log(qrcode);
      isQrCodeVisible = true;
    });
  }
  screen.render();
});

screen.key(['q', 'C-c'], () => {
  server.close();
  process.exit(0);
});

server.listen(8443, () => {
  statusBox.setContent(`\nServer is listening on port 8443\n\nSYSYEM READY\n   •Riders Temux Talk\n   •Hostpot ip:${hotspotIp}`);
  screen.render();
});
