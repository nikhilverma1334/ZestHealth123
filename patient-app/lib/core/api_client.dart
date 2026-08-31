import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static const String baseUrl = 'http://localhost:3000'; // Change in prod
  final _storage = const FlutterSecureStorage();
  
  // Single-flight refresh state
  Future<bool>? _refreshFuture;

  Future<Map<String, String>> _getHeaders() async {
    final token = await _storage.read(key: 'jwt_token');
    final headers = {
      'Content-Type': 'application/json',
      'X-Client-Type': 'mobile',
    };
    if (token != null) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Future<bool> _refreshToken() async {
    try {
      final refreshToken = await _storage.read(key: 'refresh_token');
      if (refreshToken == null) return false;

      final response = await http.post(
        Uri.parse('$baseUrl/auth/refresh'),
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Type': 'mobile', // Instructs backend to return JSON tokens
        },
        body: jsonEncode({'refresh_token': refreshToken}),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        if (data['access_token'] != null && data['refresh_token'] != null) {
          await _storage.write(key: 'jwt_token', value: data['access_token']);
          await _storage.write(key: 'refresh_token', value: data['refresh_token']);
          return true;
        }
      }
    } catch (e) {
      print('Refresh failed: $e');
    }
    return false;
  }

  Future<http.Response> get(String endpoint) async {
    return _requestWithAuth(() async {
      return http.get(Uri.parse('$baseUrl$endpoint'), headers: await _getHeaders());
    });
  }

  Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    return _requestWithAuth(() async {
      return http.post(
        Uri.parse('$baseUrl$endpoint'), 
        headers: await _getHeaders(),
        body: jsonEncode(body)
      );
    });
  }

  Future<http.Response> _requestWithAuth(Future<http.Response> Function() requestFunc) async {
    var response = await requestFunc();

    if (response.statusCode == 401) {
      // Single-flight pattern
      if (_refreshFuture == null) {
        _refreshFuture = _refreshToken().whenComplete(() {
          _refreshFuture = null; // reset after completion
        });
      }

      final success = await _refreshFuture!;

      if (success) {
        // Retry the original request
        response = await requestFunc();
      } else {
        // Force logout
        await logout();
      }
    }
    return response;
  }

  Future<void> logout() async {
    await _storage.delete(key: 'jwt_token');
    await _storage.delete(key: 'refresh_token');
    // In a real app, trigger navigation to Login Screen using a stream/callback
  }
}
