export interface PixelInfo {
  x: number;
  y: number;
  color: string;
  owner: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface PixelUpdateEvent {
  x: number;
  y: number;
  color: string;
  owner: number | null;
  canvas_id: string;
} 