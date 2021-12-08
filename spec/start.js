import { source, query, compose, setup} from '../src/index.js'


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

const Total = compose(function(bookId) {
  const [book] = query(Book, bookId)
  const total = book.price * 0.5
  return total
})

setup(function() {
  const [book, renew] = query(Book, 'xxx')
  const [total] = query(Total, 'xxx')

  document.querySelector('#root').innerHTML = `
    <div>
      <div>${book.title}</div>
      <div>${book.price}</div>
      <div>${total}</div>

      <button>刷新</button>
    </div>
  `

  document.querySelector('#root button').addEventListener('click', () => {
    renew()
  })
})
