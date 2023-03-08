import { useSource, useLazySource } from 'algeb/react'
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
    suspend('50%')
    setTimeout(() => {
      resolve('100%')
    }, 1000)
  }, 1000)
}, '0%')

const LazySource = stream(({ suspend }) => () => {
  let value = 0
  setInterval(() => {
    value ++
    suspend(value)
  }, 1000)
}, 0)

export default function App() {
  return (
    <>
      <ShowDateTime></ShowDateTime>
      <ShowPercent></ShowPercent>
      <ShowLazy></ShowLazy>
    </>
  )
}

function ShowDateTime() {
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

function ShowPercent() {
  const [percent, , percentPending] = useSource(StreamSource)
  return (
    <div>Percent: {percent} {percentPending ? 'loading...' : ''}</div>
  )
}

function ShowLazy() {
  const [lazyData, lazyRequest] = useLazySource(LazySource)
  return (
    <div>
      Lazy:
      <span>{lazyData}</span>
      <button onClick={() => lazyRequest()}>start</button>
    </div>
  )
}
