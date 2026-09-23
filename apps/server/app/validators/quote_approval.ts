import vine from '@vinejs/vine'

export const submitApprovalValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().minLength(1).maxLength(2000),
    businessImpact: vine.string().trim().maxLength(2000).optional(),
    valueImpact: vine.string().trim().maxLength(255).optional(),
  })
)

export const decideApprovalValidator = vine.compile(
  vine.object({
    action: vine.enum(['approve', 'reject'] as const),
    comment: vine.string().trim().maxLength(2000).optional(),
  })
)
