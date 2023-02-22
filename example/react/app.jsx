import { useSource } from 'algeb/react'
import { source } from 'algeb/index'
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

export default function App() {
  const [status, setStatus] = useState(0)
  const [data, renew, pending, error] = useSource(SomeSource, status)

  let text = ''

  if (pending) {
    text = 'loading'
  }
  else if (error) {
    text = error.error.message
  }
  else {
    text = data.time
  }

  return (
    <div>
      <div>{text}</div>
      <div><button onClick={() => setStatus(status + 1)}>change</button></div>
      <div><button onClick={renew}>renew</button></div>
    </div>
  )
}
