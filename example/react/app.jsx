import { useSource } from 'algeb/react'
import { source, compose, query } from 'algeb'
import { useState } from 'react'

const SomeSource = source((status) => new Promise((resolve, reject) => {
  setTimeout(() => {
    if (status % 2) {
      reject(new Error('err'))
    }
    else {
      resolve({ name: 'sunny', time: Date.now() })
    }
  }, 1000)
}), {})

const CompoundSource = compose((status) => {
  const [some] = query(SomeSource, status)
  return some
})

export default function App() {
  const [status, setStatus] = useState(0)
  const [data, renew, pending, error] = useSource(CompoundSource, status)

  let text = ''

  if (pending) {
    console.log('pending')
    text = 'loading'
  }
  else if (error) {
    console.log('error')
    text = error.error.message
  }
  else {
    console.log('ok', data)
    text = data.time
  }

  return (
    <div>
      <div>{text}</div>
      <div><button onClick={() => setStatus(status + 1)}>change</button></div>
      <div><button onClick={() => renew()}>renew</button></div>
    </div>
  )
}
