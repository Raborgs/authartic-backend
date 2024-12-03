import { Injectable, NotFoundException,BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCountryDto } from './dto/create-country.dto';
import { Country } from './entities/country.entity';
import { UpdateCountryDto } from './dto/update-country.dto';
import { GetCountryDto } from './dto/get-country.dto';
import { plainToInstance } from 'class-transformer';
import { checkIsAdmin } from 'src/utils/check-is-admin.util';
import { User } from '../user/entities/user.entity';
import { throwIfError } from 'src/utils/error-handler.util';

@Injectable()
export class CountryService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) { }

  // public 
  async findActiveCountries(): Promise<GetCountryDto[]> {
    const activeCountries = await this.countryRepository.find({
      where: { status: 1, is_deleted: false },
    });

    return plainToInstance(GetCountryDto, activeCountries, { excludeExtraneousValues: true });
  }

  async findOne(id: number): Promise<GetCountryDto> {
  
    throwIfError(!id, 'Country ID is required.')
    const country = await this.countryRepository.findOne({
      where: { id },
    });

    throwIfError(!country, 'Country not found.', NotFoundException)

    return plainToInstance(GetCountryDto, country, { excludeExtraneousValues: true });
  }

  // admin 
  async create(createCountryDto: CreateCountryDto, user: User): Promise<GetCountryDto> {
    checkIsAdmin(user, "Only Admin can perform this action.");

    const newCountryName = createCountryDto.name.toLowerCase();

    const existingCountry = await this.countryRepository.findOne({
      where: [{ name: newCountryName }, { code: createCountryDto.code }],
      select: ['name', 'code'],
    });

    if (existingCountry) {
      throwIfError((existingCountry.name === newCountryName), 'Country name already exists.', ConflictException)
      throwIfError((existingCountry.code === createCountryDto.code), 'Country code already exists.', ConflictException)
    }

    const newCountry = this.countryRepository.create({
      ...createCountryDto,
      name: newCountryName,
    });

    const savedCountry = await this.countryRepository.save(newCountry);
    return plainToInstance(GetCountryDto, savedCountry, { excludeExtraneousValues: true });
  }

  async findCountries(
    user: User,
    isActive: boolean,
    name?: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ isActive: boolean, totalCount: number; totalPages: number; currentPage: number; data: GetCountryDto[] }> {

    checkIsAdmin(user, "Only Admin can access this data.");


    const query = this.countryRepository.createQueryBuilder('country')
      .where('country.is_deleted = false');

    if (isActive) {
      query.andWhere('country.status = :status', { status: 1 });
    } else {
      query.andWhere('country.status = :status', { status: 2 });
    }

    if (name) {
      query.andWhere('LOWER(country.name) LIKE LOWER(:name)', { name: `%${name}%` });
    }

    const totalCount = await query.getCount();

    const countries = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const countryDtos = plainToInstance(GetCountryDto, countries, { excludeExtraneousValues: true });

    return {
      isActive,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      data: countryDtos,
    };
  }

  async updateCountry(id: number, updateCountryDto: UpdateCountryDto, user: User): Promise<GetCountryDto> {
    checkIsAdmin(user, "Only Admin can perform this action.");

    const existingCountry = await this.findOne(id);

    throwIfError(!existingCountry, 'Country not found.', NotFoundException)

    throwIfError(existingCountry.name.toLowerCase() === updateCountryDto.name.toLowerCase(), 'Another country with this name already exists.', ConflictException);

    throwIfError(existingCountry.code === updateCountryDto.code, 'Another country with this code already exists.', ConflictException);

    const updatedCountryName = updateCountryDto.name.toLowerCase();
    await this.countryRepository.update(id, { ...updateCountryDto, name: updatedCountryName });

    const updatedCountry = await this.findOne(id);
    return plainToInstance(GetCountryDto, updatedCountry, { excludeExtraneousValues: true });
  }

  async remove(id: number, user: User): Promise<{ message: string }> {
    checkIsAdmin(user, "Only Admin can delete country.");

    const country = await this.findOne(id);
    throwIfError(!country, 'Country not found.', NotFoundException)

    await this.countryRepository.delete(id);
    return { message: 'Country deleted successfully.' };
  }

  async getCountriesCounts(user: User): Promise<{ activeCountries: number; totalCountries: number }> {
    checkIsAdmin(user, "Only Admin can access this data.");

    const totalCountries = await this.countryRepository.count();
    const activeCountries = await this.countryRepository.count({
      where: { status: 1, is_deleted: false },
    });

    return { totalCountries, activeCountries };
  }
}
