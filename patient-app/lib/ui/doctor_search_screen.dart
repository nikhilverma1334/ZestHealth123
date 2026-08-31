import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:geolocator/geolocator.dart';
import '../core/api_client.dart';

class DoctorSearchScreen extends StatefulWidget {
  @override
  _DoctorSearchScreenState createState() => _DoctorSearchScreenState();
}

class _DoctorSearchScreenState extends State<DoctorSearchScreen> {
  final ApiClient _apiClient = ApiClient();
  final TextEditingController _searchController = TextEditingController();
  
  List<dynamic> _results = [];
  bool _isLoading = false;
  String _error = '';
  String _sortBy = 'soonest';

  Future<Position?> _determinePosition() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return null;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return null;
      }
    }
    
    if (permission == LocationPermission.deniedForever) {
      return null;
    } 

    return await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
  }

  Future<void> _performSearch() async {
    final query = _searchController.text.trim();
    if (query.isEmpty) return;

    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final position = await _determinePosition();
      
      // Fallback to 0,0 (or could prompt for manual address) if permission denied
      final lat = position?.latitude ?? 0.0;
      final lng = position?.longitude ?? 0.0;

      if (position == null) {
        // Soft warning to user that results won't be distance-accurate
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Location permission denied. Distance sorting disabled.')),
        );
        if (_sortBy == 'closest') _sortBy = 'soonest'; // Reset sort if closest was picked
      }

      final response = await _apiClient.get('/search/doctors?q=$query&lat=$lat&lng=$lng&sort=$_sortBy');
      if (response.statusCode == 200) {
        setState(() {
          _results = jsonDecode(response.body);
        });
      } else {
        setState(() {
          _error = 'Failed to fetch search results.';
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Network error occurred.';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Find a Doctor')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search by specialty or symptom...',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _performSearch(),
                  ),
                ),
                SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _isLoading ? null : _performSearch,
                  child: Text('Search'),
                )
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Sort by:'),
                DropdownButton<String>(
                  value: _sortBy,
                  items: [
                    DropdownMenuItem(value: 'soonest', child: Text('Soonest Available')),
                    DropdownMenuItem(value: 'shortest_wait', child: Text('Shortest Wait')),
                    DropdownMenuItem(value: 'closest', child: Text('Closest to Me')),
                    DropdownMenuItem(value: 'cheapest', child: Text('Lowest Fee')),
                  ],
                  onChanged: (val) {
                    if (val != null) {
                      setState(() => _sortBy = val);
                      _performSearch();
                    }
                  },
                ),
              ],
            ),
          ),
          if (_error.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: Text(_error, style: TextStyle(color: Colors.red)),
            ),
          if (_isLoading) CircularProgressIndicator(),
          Expanded(
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (context, index) {
                final doctor = _results[index];
                return Card(
                  margin: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: ListTile(
                    title: Text(doctor['name'] ?? 'Unknown Doctor'),
                    subtitle: Text(
                      '${doctor['specialty'] ?? ''} - ${doctor['hospitalName'] ?? ''}\n'
                      'Distance: ${doctor['distanceText'] ?? 'N/A'} | Next slot: ${doctor['nextAvailableSlot'] ?? 'N/A'}\n'
                      'Fee: ₹${doctor['fee'] ?? 'N/A'} | Typical Wait: ${doctor['avgWait'] ?? 'N/A'} mins'
                    ),
                    isThreeLine: true,
                    trailing: ElevatedButton(
                      child: Text('Book'),
                      onPressed: () {
                        // Navigate to Booking Screen
                      },
                    ),
                  ),
                );
              },
            ),
          )
        ],
      ),
    );
  }
}
