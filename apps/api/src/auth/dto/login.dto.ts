import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  MaxLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class SetPinDto {
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  pin!: string;
}

export class LoginPinDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(4)
  pin!: string;
}
