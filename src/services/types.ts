export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}

export type IResponse<TResult = unknown> =
  | {
      success: true;
      result?: TResult;
    }
  | {
      success: false;
      statusCode: number;
      error: string;
      details?: unknown;
    };
