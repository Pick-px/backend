-- canvas_history의 외래키를 on delete cascade로 변경
ALTER TABLE canvas_history
DROP CONSTRAINT IF EXISTS canvas_history_canvas_id_fkey;

ALTER TABLE canvas_history
ADD CONSTRAINT canvas_history_canvas_id_fkey
FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE; 