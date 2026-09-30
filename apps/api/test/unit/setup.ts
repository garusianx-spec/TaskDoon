import { Logger } from '@nestjs/common';

// Services log expected warnings (a failing SMS provider, say); unit tests assert on behaviour.
Logger.overrideLogger(false);
