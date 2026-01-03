import * as sysMsg from '../../../constants/system.messages';

export const SchoolSwagger = {
  endpoints: {
    getSchoolDetails: {
      operation: {
        summary: 'Get school details',
        description: 'Retrieves the details of the school installation.',
      },
      responses: {
        ok: {
          description: 'School details retrieved successfully',
          schema: {
            example: {
              id: 'uuid-123',
              name: 'Test School',
              address: '123 Main Street',
              email: 'test@school.com',
              phone: '1234567890',
              logo_url: 'logo.png',
              primary_color: '#000000',
              secondary_color: '#ffffff',
              accent_color: '#cccccc',
              installation_completed: true,
            },
          },
        },
        notFound: {
          description: sysMsg.SCHOOL_NOT_FOUND,
        },
      },
    },
    getSetupStatus: {
      operation: {
        summary: 'Get setup status',
        description: 'Returns the current setup phase and completion status',
      },
      responses: {
        ok: {
          schema: {
            example: {
              status_code: 200,
              message: sysMsg.SETUP_STATUS_RETRIEVED_SUCCESSFULLY,
              data: {
                is_complete: true,
                current_step: 'school_info',
                school_id: 'uuid-123',
                phases: {
                  school_info: { completed: true },
                  landing_page: { completed: true },
                  superadmin: { completed: true },
                },
              },
            },
          },
        },
      },
    },
  },
};
