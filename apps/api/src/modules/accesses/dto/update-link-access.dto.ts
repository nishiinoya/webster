import { IsIn } from 'class-validator';

export class UpdateLinkAccessDto {
  @IsIn(['restricted', 'anyone_with_link'])
  mode: 'restricted' | 'anyone_with_link';

  @IsIn(['viewer', 'commenter', 'editor'])
  permission: 'viewer' | 'commenter' | 'editor';
}
