declare module "africastalking" {
  interface AfricasTalkingConfig {
    apiKey: string;
    username: string;
  }

  interface SMSOptions {
    to: string[];
    message: string;
    from?: string;
  }

  interface SMSRecipient {
    number: string;
    status: string;
    statusCode: number;
    messageId: string;
    cost: string;
  }

  interface SMSResponse {
    SMSMessageData: {
      Message: string;
      Recipients: SMSRecipient[];
    };
  }

  interface ApplicationData {
    UserData: {
      balance: string;
    };
  }

  interface SMS {
    send(options: SMSOptions): Promise<SMSResponse>;
  }

  interface Application {
    fetchApplicationData(): Promise<ApplicationData>;
  }

  interface AfricasTalkingClient {
    SMS: SMS;
    APPLICATION: Application;
  }

  function AfricasTalking(config: AfricasTalkingConfig): AfricasTalkingClient;

  export = AfricasTalking;
}
