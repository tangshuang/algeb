import { source, select, use, compose, affect, query, setup } from 'algeb'

/**
 * Sources
 * Async
 */

const Book = source(async function(bookId) {
  const res = await fetch(URL + bookId).then(res => res.json())
  const { data } = res
  return data
}, {
  title: '',
  price: 0,
})

const Photo = source(async function(photoId) {
  const res = await fetch(URL + photoId).then(res => res.json())
  const { data } = res
  return data
}, {
  title: '',
  price: 0,
})


/**
 * Selectors
 * Sync/Async
 */

const Total = select(function(bookId, photoId) {
  const book = query(Book, bookId)
  const photo = query(Photo, photoId)
  return book.price + photo.price
})


/**
 * Queries
 * Sync
 */

const Query = compose(function(bookId, photoId) {
  const [book, fetchBook] = use(Book, bookId)
  const [photo, fetchPhoto] = use(Photo, photoId)
  const total = query(Total, bookId, photoId)

  affect(() => {
    const timer = setInterval(() => {
      fetchBook()
      fetchPhoto()
    }, 1000)
    return () => clearInterval(timer)
  }, [book, photo])

  return { book, photo, total }
})


/**
 * Setup/Run
 */

setup(function() {
  const { book, photo, total } = query(Query, 'book id', 'photo id')

  const html = `
    <div>
      <span>Book Name: ${book.title}</span>
      <span>Photo Name: ${photo.title}</span>
      <span>Total Cost: ${total}</span>
    </div>
  `

  document.querySelector('#root').innerHTML = html
})
