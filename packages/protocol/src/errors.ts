export type ProtocolErrorCode =
  | 'BASE_VERSION_MISMATCH'
  | 'PATH_TRAVERSAL_DENIED'
  | 'WORKSPACE_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FILE_NOT_FOUND'
  | 'FILE_ALREADY_EXISTS'
  | 'COMMAND_FAILED'
  | 'TERMINAL_SESSION_NOT_FOUND'
  | 'PROCESS_NOT_FOUND'
  | 'PAIRING_EXPIRED'
  | 'INVALID_PAIRING_CODE'
  | 'CONFLICT_DETECTED'
  | 'INTERNAL_ERROR';

export interface ProtocolErrorDetail {
  code: ProtocolErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export class RemoteDevError extends Error {
  public readonly code: ProtocolErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ProtocolErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'RemoteDevError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, RemoteDevError.prototype);
  }

  toJSON(): ProtocolErrorDetail {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
