export type Meeting = {
  id: string;
  title: string;
  room_name: string;
  host_id: string;
  created_at: string;
  status: "active" | "ended";
};
