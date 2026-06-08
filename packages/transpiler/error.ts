export const ErrorCode = {
    PARSE_ERROR: 'PARSE_ERROR',
    REFERENCE_ERROR: 'REFERENCE_ERROR',
    IO_ERROR: 'IO_ERROR',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type AppError = Error & {
    readonly code: ErrorCode;
    readonly stack: string;
    readonly cause: unknown | undefined;
    meta: Record<string, unknown> | undefined;
    readonly timestamp: number;
};

export type SerializedError = {
    code: ErrorCode;
    message: string;
    stack: string;
    cause: string | undefined;
    meta: Record<string, unknown> | undefined;
    timestamp: number;
};

export type ErrorOptions = {
    cause?: unknown;
    meta?: Record<string, unknown>;
};

export type LogLevel = 'error' | 'warn' | 'debug';

const errorCodes = new Set<ErrorCode>(Object.values(ErrorCode));

function messageFrom(raw: unknown): string {
    if (raw instanceof Error) {
        return raw.message;
    }

    if (typeof raw === 'string') {
        return raw;
    }

    try {
        return String(raw);
    } catch {
        return 'Unknown error';
    }
}

function causeToString(cause: unknown): string {
    try {
        return String(cause);
    } catch {
        return 'Unknown cause';
    }
}

export function create(code: ErrorCode, message: string, options?: ErrorOptions): AppError {
    const error = new Error(message, {
        cause: options?.cause,
    }) as AppError;

    Object.defineProperties(error, {
        code: {
            configurable: true,
            enumerable: true,
            value: code,
        },
        meta: {
            configurable: true,
            enumerable: true,
            value: options?.meta,
            writable: true,
        },
        timestamp: {
            configurable: true,
            enumerable: true,
            value: Date.now(),
        },
    });

    if (error.stack === undefined) {
        Object.defineProperty(error, 'stack', {
            configurable: true,
            value: `${error.name}: ${message}`,
        });
    }

    return error;
}

export function wrap(raw: unknown, code: ErrorCode = ErrorCode.UNKNOWN_ERROR, meta?: Record<string, unknown>): AppError {
    if (is(raw)) {
        if (meta !== undefined) {
            raw.meta = {
                ...raw.meta,
                ...meta,
            };
        }

        return raw;
    }

    return create(code, messageFrom(raw), {
        cause: raw,
        meta,
    });
}

export function is(value: unknown, code?: ErrorCode): value is AppError {
    if (!(value instanceof Error)) {
        return false;
    }

    const candidate = value as Partial<AppError>;
    if (
        typeof candidate.code !== 'string' ||
        !errorCodes.has(candidate.code as ErrorCode) ||
        typeof candidate.stack !== 'string' ||
        typeof candidate.timestamp !== 'number'
    ) {
        return false;
    }

    return code === undefined || candidate.code === code;
}

export function serialize(error: AppError): SerializedError {
    return {
        code: error.code,
        message: error.message,
        stack: error.stack,
        cause: error.cause === undefined ? undefined : causeToString(error.cause),
        meta: error.meta,
        timestamp: error.timestamp,
    };
}

export function log(error: AppError, level: LogLevel = 'error'): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.toUpperCase()}] ${JSON.stringify(serialize(error))}`;

    console[level](line);
}

export function fire(code: ErrorCode, message: string, options?: ErrorOptions): never {
    throw create(code, message, options);
}
