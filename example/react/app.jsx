import { useSource } from 'algeb/react'
import { source, compose, query, stream } from 'algeb'
import { useState } from 'react'

const SomeSource = source((status) => new Promise((resolve, reject) => {
  setTimeout(() => {
    if (status % 2) {
      reject(new Error('err'))
      return
    }
    resolve({ name: 'sunny', time: Date.now() })
  }, 1000)
}), {})

const CompoundSource = compose((status) => {
  const [some] = query(SomeSource, status)
  return some
})

const StreamSource = stream(({ initiate, suspend, resolve }) => () => {
  initiate()
  setTimeout(() => {
    suspend(2000)
    setTimeout(() => {
      resolve(4000)
    }, 1000)
  }, 1000)
}, 0)

export default function App() {
  const [status, setStatus] = useState(0)
  const [data, renew, pending, error] = useSource(CompoundSource, status)
  const [count, , pendingCount] = useSource(StreamSource)

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
      <div>count: {count} {pendingCount ? 'loading...' : ''}</div>
    </div>
  )
}
