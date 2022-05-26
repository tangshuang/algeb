import { source, query, compose, affect, setup, apply, ref, select, request } from '../src/index.js'


/**
 * Sources
 * Async
 */

const Book = source(async function(bookId) {
  const data = await Promise.resolve().then(() => {
    const random = +(Math.random() * 100).toFixed(2)
    return {
      title: 'Book_' + bookId,
      price: random,
    }
  })
  return data
}, {
  title: 'Book',
  price: 0,
})

const Photo = source(async function(photoId) {
  const data = await Promise.resolve().then(() => {
    const random = +(Math.random() * 100).toFixed(2)
    return {
      title: 'Photo_' + photoId,
      price: random,
    }
  })
  return data
}, {
  title: 'Photo',
  price: 0,
})


/**
 * Compsoe
 * Sync
 */

const Mix = compose(function(bookId, photoId, requestId) {
  const [book, fetchBook] = query(Book, bookId)
  const [photo, fetchPhoto] = query(Photo, photoId)
  const requestRef = ref(0)
  const [request, setRequest] = apply(() => requestRef.value ++, 0)(requestId)

  const total = select(() => book.price + photo.price, [book.price, photo.price])

  affect(() => {
    const timer = setInterval(() => {
      fetchBook()
      fetchPhoto()
      setRequest()
    }, 2000)
    return () => {
      clearInterval(timer)
    }
  }, [book, photo])

  return { book, photo, total, request }
})

/**
 * Setup/Run
 * Sync
 */

setup(function() {
  const [bookData, fetchBook] = query(Book, 100)
  const [{ book, photo, total, request }] = query(Mix, 100, 200, 0)

  const html = `
    <div>
      <span>Book Name: ${book.title}</span>
      <br />
      <span>Photo Name: ${photo.title}</span>
      <br />
      <span>Total Cost: $${total.toFixed(2)}</span>
      <br />
      <span>Request ID: ${request}</span>
    </div>
  `

  document.querySelector('#root').innerHTML = html
})


request(true, Book, 200).then(console.log)
