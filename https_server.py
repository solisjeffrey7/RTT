from flask import Flask, send_from_directory
from flask_socketio import SocketIO, emit
import os
import ssl

app = Flask(__name__)
socketio = SocketIO(app)

@app.route('/')
def index():
    return send_from_directory(os.getcwd(), 'index.html')

@socketio.on('connect')
def handle_connect():
    print('A client has connected')
    emit('message', 'A new user has connected!', broadcast=True)

@socketio.on('message')
def handle_message(data):
    # Broadcast the received message to all connected clients
    emit('message', data, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    print('A client has disconnected')

if __name__ == '__main__':
    # Set up SSL context
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile='certs/server.crt', keyfile='certs/server.key')  # Replace with your actual cert and key

    socketio.run(app, host='0.0.0.0', port=8000, ssl_context=context)
