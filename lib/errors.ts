import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "internal_error";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

const STATUS_FOR: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 400,
  conflict: 409,
  internal_error: 500,
};

export function apiError(code: ApiErrorCode, message: string, details?: unknown) {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status: STATUS_FOR[code] });
}

export function fromZod(err: ZodError) {
  return apiError("validation_error", "Invalid input.", err.flatten());
}
