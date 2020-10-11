import { source, query, compose, affect, setup } from '../src/index.js'


/**
 * Sources
 * Async
 */

const Book = source(async function(bookId) {
  const data = await Promise.resolve().then(() => {
    const random = +(Math.random() * 100).toFixed(2)
    return {
      title: 'Book:' + bookId,
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
      title: 'Photo:' + photoId,
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

const Mix = compose(function(bookId, photoId) {
  const [book, fetchBook] = query(Book, bookId)
  const [photo, fetchPhoto] = query(Photo, photoId)

  const total = book.price + photo.price

  affect(() => {
    const timer = setInterval(() => {
      fetchBook()
      fetchPhoto()
    }, 5000)
    return () => {
      clearInterval(timer)
    }
  }, [book, photo])

  return { book, photo, total }
})


/**
 * Setup/Run
 * Sync
 */

setup(function() {
  const [{ book, photo, total }] = query(Mix, 100, 200)

  const html = `
    <div>
      <span>Book Name: ${book.title}</span>
      <span>Photo Name: ${photo.title}</span>
      <br />
      <span>Total Cost: ${total}</span>
    </div>
  `

  document.querySelector('#root').innerHTML = html
})
