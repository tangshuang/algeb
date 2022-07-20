# ALGEB

一个模拟代数效应的前端数据源管理工具。

## 理念介绍

这是一个比较抽象的库，一开始可能比较难理解。我写它的初衷，是创建可响应的数据请求管理。在传统数据请求中，我们只是把携带ajax代码的一堆函数放在一起，这样就可以调用接口。但是这种方案不是很灵活，无法解决共享数据源，数据没回来时怎么办等等问题。我以前写过一个库databaxe，这个库抽象出了“数据源”这一概念，但是由于内置请求，导致无法灵活的适应各种框架。能否更底层更灵活一些？在研究react hooks之后，我决定做这个尝试，于是写出了这个库。

Algeb的核心理念和hooks一脉相承，简单的说，就是希望开发者可以在应用中以同步代码的形式进行写作，不用担心数据是否存在，只需要按照命令式的语句进行书写，就可以完成操作，而无需考虑数据本身。

## 安装

```
npm i algeb
```

## API

```js
import { source, query, setup } from 'algeb'
```

### source(fn, default)

创建一个数据源获取对象获取器。

```js
const Book = source(async function(bookId) {
  const res = await fetch(some_url).then(res => res.json())
  const { data } = res
  return data
}, {
  title: 'Book',
  price: 0,
})
```

我们得到的`Book`被成为“源”（Source），也就是获取数据的地方，在第一个函数中，你可以做任何操作，只要最终返回数据给我们即可。

- fn 可以是同步函数，也可以是异步函数，但最终都会被当作异步函数来使用。
- default 默认值，当fn还处于异步状态时，使用该值作为第一次计算的值进行计算。

### query(Source, ...params)

获取源数据。

```js
const [book, refetch, deferer] = query(Book, bookId)
```

我们得到一个只有3个值的数组，第一个值是当前Book的真实数据，第二个值是重新获取最新的数据的触发函数（该触发函数只触发请求，不返回结果），第三个值是请求过程的deferer，可用于判断是否还在处于请求状态中。

- Source 由`source`或`compose`创建的源。
- params 传给`source`或`compose`第一个参数函数的参数。

下文会在`setup`部分详细讲`refetch`的运行机制。

### setup(fn)

执行基于源的副作用运算。

```js
setup(function() {
  const [book, refetch] = query(Book, bookId)

  render`
    <div>
      <span>${book.title}</span>
      <span>${book.price}</span>
      <button onclick="${refetch}">refresh</button>
    </div>
  `
})
```

当执行该语句之后，setup中的函数会被执行。当refetch函数被调用，触发数据请求，当数据请求完成后，setup中断函数会被再次执行。
`setup`的fn必须是同步函数，在第一次执行query时，由于请求刚刚发出，还没有真实值，因此会使用default作为默认值返回。

这就是 Algeb 的执行机制：通过触发数据源的重新请求，在得到新数据之后，重新执行setup中的函数，从而实现副作用的反复执行。'

setup返回stop函数，同时，它包含3个静态属性：

```
{
  stop(): 停止setup再次执行的机制
  next(): 如果执行完stop后，你又想再次运行这个机制，可以再调用next重新开始，如果没有执行过stop，调用next没有任何效果
  value: fn的返回值，在执行机制中，fn会被反复执行，每次执行后，value都会被修改
}
```

例子：

```js
const ctx = setup(() => {
  const [book, refetch] = query(Book, bookId)

  render`
    <div>
      <span>${book.title}</span>
      <span>${book.price}</span>
      <button onclick="${refetch}">refresh</button>
    </div>
  `

  return book
})

setInterval(() => {
  console.log(ctx.value) // 每次都可能不一样
}, 1000)
```

## 非代数效应用法

以下方法都不应该在setup内部被调用。

### action(act)

创建一个仅用于处理副作用的source，该source只能被request使用。

```js
const Update = action(async (bookId, data) => {
  await patch('/api/books/' + bookId, data) // 提交数据到后台
  request(Book, bookId) // 强制刷新数据
})
```

### renew(source, ...params)

你可以使用renew来更新一个数据源。

```js
renew(source, { id })
```

请求完成时，对应参数的结构将会被放入仓库中，并触发对应的setup。

注意，`Action`不能用于renew。


### isSource(value)

用于判断一个对象是否为source，返回boolean。

### release(sources)

释放之前被请求过的源的保持数据，恢复到该源的初始状态。
注意：基于不同参数得到的不同数据，将被全部释放，新的query都会重新请求数据。

```js
release([Book, Photo])
release({ Book, Photo }) // -> 方便从文件一次性导出(import * as Sources from './srouces')时一次性释放
```

### request(source, ...params)

你可以用request，把source转化为类似一个普通的ajax请求来使用。
基于source发起请求，返回一个基于新请求的Promise，该请求将绕过algeb的运行机制，让你可以使用它作为纯粹的ajax数据请求。

```js
const data = await request(source, { id })
```

注意，`Compound Source`不能用于request。

## 高级用法

```js
import { compose, affect, select } from 'algeb'
```

### compose(fn)

创建一个基于源的组合获取器，它的作用是在源的基础上封装对该源的更多定义，一般是结合`query`一起使用。

```js
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
```

我们可以同时组合多个源，获得一个“复合源”（Compound Source），组合函数必须是同步函数。组合函数返回组合后的复杂对象，还可以在内部提供一些特殊逻辑，比如上面的代码中，规定了每5秒钟更新数据源。

在compose组合函数中，你可以使用hooks（下方详解，source中不可以使用hooks），也可以query其他Compound Source。总之，compose组合其他源，同时可以使用hooks对不同源之间的重新计算逻辑进行逻辑处理。

它返回最终生成的“复合源”（Compound Source），它和source生产的源一样，可以被query使用，不同的是，query它返回的第二个值（函数）将触发组合内所有被依赖源全部重新请求新数据。

```js
const [mix, updateMix] = query(Mix)
```

当调用`updateMix()`时，Book和Photo这两个源的数据都会被重新请求。你也可以传入参数来决定只重新请求哪些源

```js
updateMix(Book) // 只重新请求Book源
```

通过compose我们可以组合不同数据源，组合数据源的数据拉取规则，有利于复用一些特定规则。

## Hooks

下面的是hooks函数，它只能在compose或setup内部被使用，否则会导致错误。hooks的使用规则遵循react的规则，不允许在if..else中使用，必须在顶层撰写。

### affect(fn, deps)

第一个hooks函数，它用于在compose或setup函数中执行一个副作用，它的使用方法和react hooks的useEffect基本一致，但在第二个参数上稍有不同。

- 如果不传deps，那么affect函数仅在compose函数第一次被执行时会执行
- 如果传入数组，那么每次执行会进行deps对比（深对比，对比内部对象每个节点上的值），有差异时执行

### select(calc, deps)

它用于在compose或setup函数中，采用缓存计算技术得到一个值，和useMemo类似，它是否要重新计算值，取决于第二个参数deps是否发生变化。

- 如果不传deps，那么select仅在第一次进行计算，之后永远使用缓存
- 如果传入数组，那么每次执行会进行deps对比（深对比，对比内部对象每个节点上的值），有差异时才重新计算并缓存新值

### apply(get, default)

某些情况下，你不想单独创建一个source，而是直接在compose中申请一个source，这样可以方便一些特定的source管理。此时，你可以使用apply。

```js
const Mix = compose(function(bookId) {
  const queryBook = apply((bookId) => ..., { name, price })
  const [book, updateBook] = queryBook(bookId)
  ...
})
```

apply本质上就是在compose内部的source函数。这样，你不需要在最外层通过source创建一个源，可以让代码分块更加一目了然。

### ref(value)

有时你需要保持一个不变的量，此时使用ref。

```js
const Mix = compose(function() {
  const some = ref(0)

  affect(() => {
    setInterval(() => {
      some.value ++
    }, 1000)
  }, [])

  const any = select(() => some.value % 2, [some.value])
  ...
})
```

它和react的useRef很像，修改.value不会带来重新请求。

## React中使用

```js
import { useQuery } from 'algeb/react'

function MyComponent(props) {
  const { id } = props
  const [some, fetchSome] = useQuery(SomeSource, id)
  // ...
}
```

## Vue中使用

```js
import { useQuery } from 'algeb/vue'

export default {
  setup(props) {
    const { id } = props
    const [_some, fetchSome] = useQuery(SomeSource, id)
    const some = _some.value
    // ...
  }
}
```

## Angularjs中使用

```js
const { useQuery } = require('algeb/vue')

module.exports = ['$scope', '$stateParams', function($scope, $stateParams) {
  const { id } = $stateParams
  const [some, fetchSome] = useQuery(SomeSource, id)($scope)
  $scope.some = some // { value }
  // ...
}]
```

## Angular中使用

```ts
import { Algeb } from 'algeb/angular'

@Component()
class MyComponent {
  @Input() id

  constructor(private algeb:Algeb) {
    const [some, fetchSome] = this.algeb.useQuery(SomeSource, this.id)
    this.some = some // { value }
  }
}
```

## Lisence

MIT
