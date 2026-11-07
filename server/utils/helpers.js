export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Query values can be objects (?id[$ne]=x); only plain 24-hex strings are accepted as ids.
export function asId(value, name = 'id') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new ApiError(400, `Invalid ${name}`);
  return value;
}

export function parsePagination(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
