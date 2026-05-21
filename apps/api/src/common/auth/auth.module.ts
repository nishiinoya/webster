import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { WsAuthGuard } from './ws-auth.guard';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, WsAuthGuard],
  exports: [PassportModule, JwtStrategy, WsAuthGuard],
})
export class AuthModule {}
