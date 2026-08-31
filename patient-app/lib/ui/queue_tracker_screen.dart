import 'package:flutter/material.dart';
import '../core/socket_client.dart';

class QueueTrackerScreen extends StatefulWidget {
  final String appointmentId;
  final int tokenNumber;

  QueueTrackerScreen({required this.appointmentId, required this.tokenNumber});

  @override
  _QueueTrackerScreenState createState() => _QueueTrackerScreenState();
}

class _QueueTrackerScreenState extends State<QueueTrackerScreen> {
  final SocketClient _socketClient = SocketClient();
  
  int _patientsAhead = 0;
  String _eta = "Calculating...";
  String _status = "BOOKED";

  bool _leaveNowTriggered = false;

  @override
  void initState() {
    super.initState();
    _initSocket();
  }

  Future<void> _initSocket() async {
    await _socketClient.connect();
    
    _socketClient.socket?.on('queue_update', (data) {
      if (mounted && data['appointmentId'] == widget.appointmentId) {
        setState(() {
          _patientsAhead = data['patientsAhead'] ?? _patientsAhead;
          _eta = data['eta'] != null ? '${data['eta']} mins' : _eta;
          _status = data['status'] ?? _status;
          _leaveNowTriggered = data['leaveNowSent'] == true;
        });
      }
    });
  }

  @override
  void dispose() {
    _socketClient.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Live Queue Tracker')),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              color: Colors.blue.shade50,
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  children: [
                    Text('YOUR TOKEN', style: TextStyle(letterSpacing: 2, color: Colors.blue.shade900)),
                    Text('#${widget.tokenNumber}', style: TextStyle(fontSize: 64, fontWeight: FontWeight.black, color: Colors.blue.shade900)),
                    Text('Status: $_status', style: TextStyle(fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ),
            SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        children: [
                          Text('Patients Ahead', style: TextStyle(color: Colors.grey.shade600)),
                          Text('$_patientsAhead', style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                ),
                SizedBox(width: 16),
                Expanded(
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        children: [
                          Text('Estimated Time', style: TextStyle(color: Colors.grey.shade600)),
                          Text(_eta, style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            Spacer(),
            if (_leaveNowTriggered)
              Container(
                padding: EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.orange.shade100,
                  borderRadius: BorderRadius.circular(8)
                ),
                child: Row(
                  children: [
                    Icon(Icons.directions_walk, color: Colors.orange.shade800),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Leave Now! Based on live traffic, it is time to depart.',
                        style: TextStyle(color: Colors.orange.shade900, fontWeight: FontWeight.bold)
                      ),
                    )
                  ],
                ),
              )
          ],
        ),
      ),
    );
  }
}
