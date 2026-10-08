import { Test } from '@nestjs/testing';

import { User } from './entities/user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController owner assignment', () => {
  const assignFirstOwner = jest.fn();
  const getFirstOwner = jest.fn();
  const findAdminProfile = jest.fn();
  const setAdminActive = jest.fn();
  let controller: UserController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            assignFirstOwner,
            getFirstOwner,
            findAdminProfile,
            setAdminActive,
          },
        },
      ],
    }).compile();
    controller = module.get(UserController);
    jest.clearAllMocks();
  });

  it('uses the authenticated admin as the assignment actor', async () => {
    const actor = { id: 'actor-id' } as User;
    const dto = { owner_user_id: 'owner-id' };
    assignFirstOwner.mockResolvedValue({ owner_user_id: dto.owner_user_id });

    await controller.assignFirstOwner(dto, actor);

    expect(assignFirstOwner).toHaveBeenCalledWith('owner-id', 'actor-id');
  });

  it('returns only the admin profile selected by the service', async () => {
    findAdminProfile.mockResolvedValue({ id: 'admin-id' });
    await expect(controller.findOne('admin-id')).resolves.toEqual({
      id: 'admin-id',
    });
    expect(findAdminProfile).toHaveBeenCalledWith('admin-id');
  });

  it('passes the authenticated actor to the admin access service', async () => {
    await controller.setAdminActive('admin-id', { is_active: false }, {
      id: 'owner-id',
    } as User);
    expect(setAdminActive).toHaveBeenCalledWith('admin-id', 'owner-id', false);
  });
});
