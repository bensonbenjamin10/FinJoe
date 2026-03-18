declare module "pg" {
  export class Pool {
    constructor(options?: {
      connectionString?: string;
      connectionTimeoutMillis?: number;
      max?: number;
      [key: string]: unknown;
    });
    connect(): Promise<PoolClient>;
    query(text: string, values?: unknown[]): Promise<QueryResult>;
    end(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
  export interface PoolClient {
    query(text: string, values?: unknown[]): Promise<QueryResult>;
    release(err?: boolean | Error): void;
  }
  export interface QueryResult {
    rows: Record<string, unknown>[];
    rowCount: number | null;
    command: string;
    fields: Array<{ name: string; dataTypeID: number }>;
  }
  export class Client {
    constructor(options?: Record<string, unknown>);
    connect(): Promise<void>;
    query(text: string, values?: unknown[]): Promise<QueryResult>;
    end(): Promise<void>;
  }
}

declare module "papaparse" {
  interface ParseConfig {
    header?: boolean;
    skipEmptyLines?: boolean | "greedy";
    dynamicTyping?: boolean;
    complete?: (results: ParseResult) => void;
    error?: (error: Error) => void;
    [key: string]: unknown;
  }
  interface ParseResult {
    data: Record<string, string>[];
    errors: Array<{ type: string; code: string; message: string; row?: number }>;
    meta: { delimiter: string; linebreak: string; aborted: boolean; truncated: boolean; fields?: string[] };
  }
  function parse(input: string, config?: ParseConfig): ParseResult;
  export default { parse };
  export { parse, ParseConfig, ParseResult };
}

declare module "express-session" {
  import { RequestHandler } from "express";
  interface SessionOptions {
    secret: string | string[];
    resave?: boolean;
    saveUninitialized?: boolean;
    store?: unknown;
    cookie?: Record<string, unknown>;
    name?: string;
    [key: string]: unknown;
  }
  function session(options: SessionOptions): RequestHandler;
  namespace session {
    interface SessionData {
      [key: string]: unknown;
    }
    class Store {
      constructor(options?: Record<string, unknown>);
      get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void;
      set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void;
      destroy(sid: string, callback?: (err?: unknown) => void): void;
    }
    class MemoryStore extends Store {}
  }
  export = session;
}

declare module "connect-pg-simple" {
  import session from "express-session";
  function connectPgSimple(session: typeof import("express-session")): new (options?: {
    pool?: unknown;
    conString?: string;
    tableName?: string;
    createTableIfMissing?: boolean;
    [key: string]: unknown;
  }) => session.Store;
  export = connectPgSimple;
}

declare module "morgan" {
  import { RequestHandler, Request, Response } from "express";
  interface TokenIndexer<TReq = Request, TRes = Response> {
    method(req: TReq, res: TRes): string | undefined;
    url(req: TReq, res: TRes): string | undefined;
    status(req: TReq, res: TRes): string | undefined;
    "response-time"(req: TReq, res: TRes): string | undefined;
    "remote-addr"(req: TReq, res: TRes): string | undefined;
    [key: string]: ((req: TReq, res: TRes) => string | undefined) | undefined;
  }
  function morgan<TReq = Request, TRes = Response>(
    format: string | ((tokens: TokenIndexer<TReq, TRes>, req: TReq, res: TRes) => string | null | undefined),
    options?: Record<string, unknown>
  ): RequestHandler;
  export = morgan;
  export { TokenIndexer };
}
