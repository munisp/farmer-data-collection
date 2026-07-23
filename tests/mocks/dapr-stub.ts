// Test-only stub for @dapr/dapr.
// The real package ships an ESM file (appcallback_pb.js) inside a CommonJS
// package, which breaks Vitest's module loader. This stub provides the same
// surface used by server/dapr-client.ts so unit tests can verify exports
// without loading the gRPC proto layer. It is aliased in ONLY via vitest.config.ts.

export enum CommunicationProtocolEnum {
  HTTP = 'http',
  GRPC = 'grpc',
}

class StateStub {
  async save() {
    return undefined;
  }
  async get() {
    return undefined;
  }
  async delete() {
    return undefined;
  }
  async getBulk() {
    return [];
  }
}

class PubSubStub {
  async publish() {
    return { error: undefined };
  }
  async subscribe() {
    return undefined;
  }
}

class InvokerStub {
  async invoke() {
    return undefined;
  }
}

class SecretStub {
  async get() {
    return {};
  }
}

export class DaprClient {
  state = new StateStub();
  pubsub = new PubSubStub();
  invoker = new InvokerStub();
  secret = new SecretStub();
  constructor(_opts?: unknown) {}
}

export class DaprServer {
  pubsub = new PubSubStub();
  constructor(_opts?: unknown) {}
  async start() {
    return undefined;
  }
  async stop() {
    return undefined;
  }
}
