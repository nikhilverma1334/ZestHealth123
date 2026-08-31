import 'package:flutter/material.dart';
import 'dart:convert';
import '../core/api_client.dart';

class BookingScreen extends StatefulWidget {
  final String doctorId;
  final String branchId;
  
  BookingScreen({required this.doctorId, required this.branchId});

  @override
  _BookingScreenState createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  final ApiClient _apiClient = ApiClient();
  bool _isBooking = false;
  
  Future<void> _bookAppointment() async {
    setState(() => _isBooking = true);
    
    try {
      final today = DateTime.now().toIso8601String().split('T')[0];
      // Note: In reality, patientId would be inferred from the JWT token on the backend, 
      // but if the endpoint requires it in the body, we'd pass it.
      
      final response = await _apiClient.post('/booking/book', {
        'doctorId': widget.doctorId,
        'branchId': widget.branchId,
        'date': today,
        'timeSlot': '09:00', // Mock selected slot
      });

      if (response.statusCode == 201) {
        final data = jsonDecode(response.body);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Token Assigned: #${data['tokenNumber']}')),
        );
        // Navigate to Live Queue Tracker
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to book appointment.')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Network error.')),
      );
    } finally {
      setState(() => _isBooking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Confirm Booking')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Confirm your appointment', style: Theme.of(context).textTheme.titleLarge),
              SizedBox(height: 20),
              ElevatedButton(
                onPressed: _isBooking ? null : _bookAppointment,
                style: ElevatedButton.styleFrom(
                  minimumSize: Size(double.infinity, 50),
                ),
                child: _isBooking 
                    ? CircularProgressIndicator(color: Colors.white)
                    : Text('Book Now'),
              )
            ],
          ),
        ),
      ),
    );
  }
}
