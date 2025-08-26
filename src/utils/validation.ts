import Joi from 'joi';

export const userRegistrationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).required()
    .messages({
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
    }),
  firstName: Joi.string().max(50).optional(),
  lastName: Joi.string().max(50).optional(),
});

export const userLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const integrationSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  retellAccountId: Joi.string().required(),
  crmAccountId: Joi.string().required(),
  retellAgentId: Joi.string().optional(),
  retellAgentName: Joi.string().optional(),
  crmObject: Joi.string().valid('leads', 'contacts', 'deals').optional(),
  fieldMappings: Joi.array().items(
    Joi.object({
      crmField: Joi.string().required(),
      retellField: Joi.string().required(),
      transform: Joi.string().valid('none', 'uppercase', 'lowercase', 'phone_format').default('none'),
      required: Joi.boolean().default(false),
    })
  ).optional(),
  triggerFilters: Joi.array().items(
    Joi.object({
      field: Joi.string().required(),
      operator: Joi.string().valid('equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than').required(),
      value: Joi.string().required(),
    })
  ).optional(),
  callConfiguration: Joi.object({
    agentId: Joi.string().required(),
    phoneNumber: Joi.string().optional(),
    customData: Joi.object().optional(),
    selectedPipelineId: Joi.string().optional(),
    selectedStageId: Joi.string().optional(),
    webhook: Joi.object({
      url: Joi.string().uri().required(),
      events: Joi.array().items(Joi.string()).required(),
    }).optional(),
  }).optional(),
  businessWorkflows: Joi.array().items(Joi.object()).optional(),
  isDraft: Joi.boolean().optional(),
  currentStep: Joi.number().integer().min(0).max(10).optional(),
});

export const updateUserProfileSchema = Joi.object({
  firstName: Joi.string().max(50).optional(),
  lastName: Joi.string().max(50).optional(),
  emailNotifications: Joi.boolean().optional(),
  inAppNotifications: Joi.boolean().optional(),
  errorNotifications: Joi.boolean().optional(),
  successNotifications: Joi.boolean().optional(),
});

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const syncEventFilterSchema = Joi.object({
  integrationId: Joi.string().optional(),
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed', 'retrying').optional(),
  eventType: Joi.string().valid('webhook_received', 'call_triggered', 'sync_completed', 'sync_failed').optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
}).concat(paginationSchema);

export function validateRequest(schema: Joi.ObjectSchema) {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
      });
    }
    
    req.body = value;
    next();
  };
}

export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.query);
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
      });
    }
    
    req.query = value;
    next();
  };
}