import Replicate from 'replicate'
import dotenv from 'dotenv'
dotenv.config()

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
  userAgent: 'https://www.npmjs.com/package/create-replicate'
})
const model = 'jagilley/controlnet-scribble:435061a1b5a4c1e26740464bf786efdfa9cb3a3ac488595a2de23e143fdb0117'
const input = {
  image: 'https://replicate.delivery/pbxt/IJE6zP4jtdwxe7SffC7te9DPHWHW99dMXED5AWamlBNcvxn0/user_1.png',
  scale: 9,
  prompt: 'a photo of a brightly colored turtle',
  a_prompt: 'best quality, extremely detailed',
  n_prompt: 'longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality',
  ddim_steps: 20,
  num_samples: '1',
  image_resolution: '512',
}

console.log('Using model: %s', model)
console.log('With input: %O', input)

console.log('Running...')
const output = await replicate.run(model, { input })
console.log('Done!', output)
