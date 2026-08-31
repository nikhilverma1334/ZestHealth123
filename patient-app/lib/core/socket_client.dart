import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

class SocketClient {
  IO.Socket? socket;
  final _storage = const FlutterSecureStorage();
  final String baseUrl = 'http://localhost:3000';

  Future<void> connect() async {
    final token = await _storage.read(key: 'jwt_token');
    if (token == null) return;

    socket = IO.io(baseUrl, IO.OptionBuilder()
      .setTransports(['websocket'])
      .disableAutoConnect()
      .setAuth({'token': token})
      .build()
    );

    socket!.onConnect((_) {
      print('Socket connected: ${socket!.id}');
      // Payload inference happens server-side, but client could manually subscribe if needed
    });

    socket!.on('token_expiring', (data) async {
      print('Token expiring: $data');
      await _silentRefresh();
    });

    socket!.onDisconnect((_) => print('Socket disconnected'));
    socket!.connect();
  }

  Future<void> _silentRefresh() async {
    try {
      final refreshToken = await _storage.read(key: 'refresh_token');
      if (refreshToken == null) return;

      final res = await http.post(
        Uri.parse('$baseUrl/auth/refresh'),
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Type': 'mobile',
        },
        body: jsonEncode({'refresh_token': refreshToken})
      );

      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body);
        if (data['access_token'] != null) {
          final newToken = data['access_token'];
          await _storage.write(key: 'jwt_token', value: newToken);
          await _storage.write(key: 'refresh_token', value: data['refresh_token']);
          
          // Reconnect with new auth
          socket!.auth = {'token': newToken};
          socket!.disconnect();
          socket!.connect();
        }
      } else {
        // Handle forced logout via stream
      }
    } catch (e) {
      print('Silent socket refresh failed: $e');
    }
  }

  void disconnect() {
    socket?.disconnect();
  }
}
