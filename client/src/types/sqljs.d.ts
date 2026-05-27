declare module 'sql.js' {
  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export interface SqlJsStatement {
    bind(params?: unknown[]): SqlJsStatement;
    step(): boolean;
    get(): unknown;
    getAsObject(): Record<string, unknown>;
    free(): void;
    reset(): void;
  }

  export interface SqlJsDatabase {
    exec(sql: string): void;
    run(sql: string, params?: unknown[]): void;
    prepare(sql: string): SqlJsStatement;
    close(): void;
  }

  export interface SqlJsModule {
    Database: new (path?: string, options?: unknown) => SqlJsDatabase;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsModule>;
}
