export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  code: string;
  errors?: Record<string, string[]>;
  timestamp: string;
  path: string;
  requestId?: string;
}
