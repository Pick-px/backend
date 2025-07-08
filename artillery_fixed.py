import csv
import tempfile
import json

CANVAS_ID = 1
TARGET_URL = "http://localhost:3000"

CSV_PATH_TEAM1 = "pixels_nexon.csv"
CSV_PATH_TEAM2 = "pixels_krafton.csv"

def read_pixels(csv_path, start_user_id):
    with open(csv_path, newline='') as csvfile:
        reader = csv.DictReader(csvfile)
        return [
            {
                "x": int(row["x"]),
                "y": int(row["y"]),
                "color": row["color"],
                "user_id": start_user_id + i
            }
            for i, row in enumerate(reader)
        ]

# CSV 데이터를 직접 JSON으로 변환
team1_pixels = read_pixels(CSV_PATH_TEAM1, 1)
team2_pixels = read_pixels(CSV_PATH_TEAM2, len(team1_pixels) + 1)
all_pixels = team1_pixels + team2_pixels

# JSON 페이로드 파일 생성
payload_file = tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode='w')
for pixel in all_pixels:
    json.dump(pixel, payload_file)
    payload_file.write('\n')
payload_file.close()

artillery_config = {
    "config": {
        "target": TARGET_URL,
        "phases": [
            { "arrivalCount": len(all_pixels), "duration": 80 }
        ],
        "engines": {
            "socketio": {
                "timeout": 30000,
                "transports": ["websocket"],
                "upgrade": False
            }
        },
        "payload": {
            "path": payload_file.name,
            "fields": ["x", "y", "color", "user_id"]
        }
    },
    "scenarios": [
        {
            "engine": "socketio",
            "flow": [
                {
                    "emit": {
                        "channel": "draw_pixel_simul",
                        "data": {
                            "canvas_id": str(CANVAS_ID),
                            "x": "{{ x }}",
                            "y": "{{ y }}",
                            "color": "{{ color }}",
                            "user_id": "{{ user_id }}"
                        }
                    }
                }
            ]
        }
    ]
}

config_path = tempfile.NamedTemporaryFile(delete=False, suffix=".json").name
with open(config_path, "w") as f:
    json.dump(artillery_config, f, indent=2)

print(f"✅ Artillery JSON 파일 생성됨: {config_path}")
print(f"✅ Payload 파일 생성됨: {payload_file.name}")