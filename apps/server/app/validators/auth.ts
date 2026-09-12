import vine from '@vinejs/vine'

export const registerValidator = vine.compile(
  vine.object({
    fullName: vine.string().trim().minLength(1).maxLength(255),
    email: vine.string().trim().email().maxLength(254),
    password: vine.string().minLength(8).maxLength(180),
  })
)

export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    password: vine.string(),
  })
)
