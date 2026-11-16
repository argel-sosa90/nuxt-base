export default defineEventHandler(async (event) => {
  await getAuthUser(event)
  throw new Error('explodiu com https://externo.example.com/segredo?token=abc')
})
