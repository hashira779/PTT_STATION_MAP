import os
import json
import io
import pandas as pd
from flask import Flask, request, jsonify, render_template, send_file

app = Flask(__name__)

DATA_DIR = 'data'
FILE_MAPPING = {
    'default': 'markers.json',
    'admin': 'markers_admin.json',
    'admin_fleet': 'markers_admin_fleet.json'
}

# --- Helper Functions (No changes) ---
def read_json_file(file_key):
    filename = FILE_MAPPING.get(file_key)
    if not filename: return None, "Invalid file key provided."
    filepath = os.path.join(DATA_DIR, filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if 'STATION' not in data or not isinstance(data['STATION'], list):
                return None, "JSON format error: Missing 'STATION' key."
            return data, None
    except FileNotFoundError:
        return {'STATION': []}, None
    except json.JSONDecodeError:
        return None, "Error decoding JSON from file."

def write_json_file(file_key, data):
    filename = FILE_MAPPING.get(file_key)
    if not filename: return False, "Invalid file key provided."
    filepath = os.path.join(DATA_DIR, filename)
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4)
        return True, None
    except Exception as e:
        return False, str(e)

# --- Web Page Route (No changes) ---
@app.route('/')
def index():
    return render_template('index.html')

# --- API Routes ---

# *** MODIFIED ENDPOINT START ***
@app.route('/api/markers/<string:file_key>/bulk_array_update', methods=['POST'])
def bulk_array_update(file_key):
    req_data = request.get_json()
    
    ids_to_update = req_data.get('ids', [])
    field = req_data.get('field')
    action = req_data.get('action')
    # Changed from 'value' to 'values' to accept a list
    values = req_data.get('values', [])

    if not all([ids_to_update, field, action, values]):
        return jsonify({"error": "Missing required parameters: ids, field, action, values."}), 400

    if not isinstance(values, list):
        return jsonify({"error": "'values' must be a list."}), 400

    valid_fields = ['description', 'product', 'other_product', 'service']
    if field not in valid_fields:
        return jsonify({"error": f"Invalid field. Must be one of {valid_fields}"}), 400

    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500

    updated_ids = set()
    id_set = set(ids_to_update)

    for station in data['STATION']:
        if str(station.get('id')) in id_set:
            if field not in station or not isinstance(station[field], list):
                station[field] = []
            
            target_list = station[field]
            
            # Loop through all values from the checkboxes
            for value in values:
                if action == 'remove':
                    if value in target_list:
                        target_list.remove(value)
                        updated_ids.add(station.get('id'))
                elif action == 'add':
                    if value not in target_list:
                        target_list.append(value)
                        updated_ids.add(station.get('id'))
    
    success, write_error = write_json_file(file_key, data)
    if not success:
        return jsonify({"error": f"Write failed: {write_error}"}), 500

    return jsonify({
        "message": f"Action '{action}' completed on field '{field}'.",
        "updated_count": len(updated_ids),
        "updated_ids": list(updated_ids)
    })
# *** MODIFIED ENDPOINT END ***

# (All other Python/Flask routes remain the same)
@app.route('/api/export/<string:file_key>')
def export_to_excel(file_key): data, error = read_json_file(file_key); station_list = data.get('STATION', []); df = pd.DataFrame(station_list); [df.__setitem__(c, df[c].apply(lambda x: ', '.join(map(str, x)) if isinstance(x, list) else x)) for c in ['description', 'product', 'other_product', 'service', 'promotion'] if c in df.columns]; output = io.BytesIO(); writer = pd.ExcelWriter(output, engine='openpyxl'); df.to_excel(writer, index=False, sheet_name='Stations'); writer.close(); output.seek(0); return send_file(output, as_attachment=True, download_name=f'{file_key}_stations.xlsx', mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
@app.route('/api/markers/<string:file_key>', methods=['GET'])
def get_markers(file_key): data, error = read_json_file(file_key); return jsonify(data.get('STATION', [])) if not error else jsonify({"error": error})
@app.route('/api/markers/<string:file_key>', methods=['PATCH'])
def update_multiple_markers(file_key): updates = request.get_json(); data, error = read_json_file(file_key); stations_map = {str(s.get('id')): s for s in data['STATION']}; updated_ids, not_found_ids = [], []; [stations_map.get(str(i.get('id'))).update(i.get('changes')) or updated_ids.append(i.get('id')) if stations_map.get(str(i.get('id'))) else not_found_ids.append(i.get('id')) for i in updates]; success, write_error = write_json_file(file_key, data); return jsonify({"updated_ids": updated_ids, "not_found_ids": not_found_ids})
@app.route('/api/markers/<string:file_key>', methods=['POST'])
def add_marker(file_key): new_marker = request.get_json(); data, error = read_json_file(file_key); station_list = data['STATION']; [new_marker.__setitem__(k, []) for k in ['description', 'product', 'other_product', 'service', 'promotion'] if k not in new_marker]; station_list.append(new_marker); success, write_error = write_json_file(file_key, data); return jsonify(new_marker), 201
@app.route('/api/markers/<string:file_key>/<string:marker_id>', methods=['PUT'])
def update_marker(file_key, marker_id): update_data = request.get_json(); data, error = read_json_file(file_key); station_list = data['STATION']; marker_found = False; updated_marker_obj = {}; [station_list.__setitem__(i, update_data) or globals().update(updated_marker_obj=station_list[i], marker_found=True) for i, m in enumerate(station_list) if str(m.get('id')) == str(marker_id)]; success, write_error = write_json_file(file_key, data); return jsonify(updated_marker_obj) if marker_found else jsonify({"error": "Not found"})
@app.route('/api/markers/<string:file_key>/<string:marker_id>', methods=['DELETE'])
def delete_marker(file_key, marker_id): data, error = read_json_file(file_key); original_count = len(data['STATION']); data['STATION'] = [m for m in data['STATION'] if str(m.get('id')) != str(marker_id)]; success, write_error = write_json_file(file_key, data); return jsonify({"message": "Deleted"}) if len(data['STATION']) < original_count else jsonify({"error": "Not Found"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7000, debug=True)