export interface PowerComponentCheck {
  name: string;
  status: string;
  is_sufficient: boolean;
  metric: string;
  details: string;
}

export interface HardwarePowerCheckReport {
  is_sufficient: boolean;
  score: number;
  summary: string;
  ac_connected: boolean;
  is_laptop: boolean;
  psu_or_adapter_verdict: string;
  checks: PowerComponentCheck[];
  dirty_shutdowns_count: number;
  throttling_events_count: number;
  usb_surge_count: number;
  recommendations: string[];
}
