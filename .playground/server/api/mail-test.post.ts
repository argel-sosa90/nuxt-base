export default defineEventHandler(async () => {
  const sent = await sendTemplatedMail({
    to: 'ana@example.com',
    reference: 'teste:1',
    subject: 'Convite',
    title: 'Você foi <convidado>',
    paragraphs: ['Bruno convidou você para a família <Silva>.'],
    button: { label: 'Aceitar', url: appLink('/convite/token-secreto') },
    note: 'O link vale por 7 dias.',
  })
  return { sent }
})
