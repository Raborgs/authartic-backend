// src/modules/font/font.service.ts
import { Injectable,BadRequestException,  NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFontDto } from './dto/create-font.dto';
import { UpdateFontDto } from './dto/update-font.dto';
import { Font } from './entities/font.entity';
import { plainToInstance } from 'class-transformer';
import { GetFontDto } from './dto/get-font.dto';
import { checkIsAdmin } from 'src/utils/check-is-admin.util';
import { User } from '../user/entities/user.entity';
import { throwIfError } from 'src/utils/error-handler.util';


@Injectable()
export class FontService {
  constructor(
    @InjectRepository(Font)
    private readonly fontRepository: Repository<Font>,
  ) { }

  // public
  async findActive(): Promise<GetFontDto[]> {
    const activeFonts = await this.fontRepository.find({
      where: { status: 1, is_deleted: false },
    });

    return plainToInstance(GetFontDto, activeFonts, { excludeExtraneousValues: true });
  }

  // admin
  async findAllFonts({
    user,
    page = 1,
    limit = 10,
    name = '',
    isActive = true,
  }: {
    user: User;
    page: number;
    limit: number;
    name: string;
    isActive: boolean;
  }): Promise<{ totalCount: number; totalPages: number; currentPage: number; data: GetFontDto[] }> {
    checkIsAdmin(user, "Only Admin can access this data.");

    const query = this.fontRepository.createQueryBuilder('font');

    if (isActive) {
      query.where('font.is_deleted = false');
    } else {
      query.where('font.is_deleted = true');
    }

    query.skip((page - 1) * limit).take(limit);

    if (name) {
      query.andWhere('font.name ILIKE :name', { name: `%${name}%` });
    }

    const totalCount = await query.getCount();
    const fonts = await query.getMany();


    const allFounts = plainToInstance(GetFontDto, fonts, { excludeExtraneousValues: true });

    return {
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      data: allFounts,
    };
  }

  async createFont(createFontDto: CreateFontDto, user: User): Promise<GetFontDto> {
    checkIsAdmin(user, "Only Admin can add new fonts.");
    const existingFont = await this.fontRepository.findOne({ where: { name: createFontDto.name } });

    throwIfError(existingFont, 'Font with this name already exists.', ConflictException )
    
    const font = this.fontRepository.create(createFontDto);
    const savedFont = await this.fontRepository.save(font);
    return plainToInstance(GetFontDto, savedFont, { excludeExtraneousValues: true });
  }

  async updateFont(id: number, updateFontDto: UpdateFontDto, user: User): Promise<GetFontDto> {
    checkIsAdmin(user, "Only Admin can perform this action.");

    const isNameAlready = await this.fontRepository.findOne({ where: { name: updateFontDto.name } });

    throwIfError(isNameAlready, 'Font with same name already exists.', ConflictException )

    const existingFont = await this.fontRepository.findOne({
      where: {
        id,
      }
    });

    throwIfError(!existingFont, 'Font not found.', NotFoundException )

    const updateResult = await this.fontRepository.update(id, updateFontDto);

    throwIfError((updateResult.affected === 0), 'Font not found.')

    const updatedFont = await this.fontRepository.findOne({ where: { id } });

    return plainToInstance(GetFontDto, updatedFont, { excludeExtraneousValues: true });
  }

  async findOneFont(id: number, user: User): Promise<GetFontDto> {
    checkIsAdmin(user, "Only Admin can access this data.");
  
    const existingFont = await this.fontRepository.findOne({
      where: {
        id,
        is_deleted: false
      }
    });

    throwIfError(!existingFont, 'Font not found.', NotFoundException)

    return plainToInstance(GetFontDto, existingFont, { excludeExtraneousValues: true });
  }

  async removeFont(id: number, user: User): Promise<{ message: string }> {
    checkIsAdmin(user, 'Only Admin can perform this action.');

    const font = await this.fontRepository.findOne({
      where: {
        id,
        is_deleted: false
      }
    });
    
    throwIfError(!font, 'Font not found.', NotFoundException)

    font.is_deleted = true;
    await this.fontRepository.save(font);
    return { message: 'Font deleted successfully.' };
  }

  async countFonts(user: User): Promise<{ activeFonts: number | 0; totalFonts: number | 0 }> {
    checkIsAdmin(user, "Only Admin can access this data.");
    const totalFonts = await this.fontRepository.count();
    const activeFonts = await this.fontRepository.count({
      where: { status: 1, is_deleted: false },
    });
    return { activeFonts, totalFonts };
  }

}
