<h2 align="center"> ✨ <b>MongoCat</b> 😺 </h2>

<p align="center"><img src="./docs/logo.png" alt="Mongocat" style="height:150px;margin: 0px 15%;text-align:center;"/>
</p>
<p align="center">
<img src="https://img.shields.io/github/issues/samayun/mongocat" alt="Issues">
<img src="https://img.shields.io/github/forks/samayun/mongocat" alt="Forks">
<img src="https://img.shields.io/github/stars/samayun/mongocat?color=%2312ff65&label=Stars&logo=Star&logoColor=green&style=flat" alt="Stars">
<img src="https://img.shields.io/github/license/samayun/mongocat" alt="License">

<a href="https://twitter.com/intent/tweet?text=What an library ! Wow !Check It =>  :&url=https://github.com/samayun/mongocat"> 
</a>
</p>

Easy to use, configuration based <b>Denormalization mongoose plugin</b> for read heavy applications. Mongocat will reduce your write complexity too.

### Installation

- `npm npm i mongocat`

### Why mongocat?

- When a mid scale application are so read heavy and need an emergency solution.

### Advantages

- application performs well for many requests

- easy to find, filter read operations

- easy to setup

- declarative approach

- maintainability - you have to manage configuration only

- very easy to sync

- frequently requirement change is not nightmare here

- Denormalize as you really need

- Single source of truth. Third party source of document updates is easily synced by mongocat

### Disadvantages

- write operations are so slow

- too much abstraction- denormalizable operations are hidden from business logic.

- write operations are expensive & have to handle sensitively

- it's behave like sql for strict mode. If foreign key doesn't exist write operation will fail. (
  it's a good advantage for data consistency too
  )

#### Requirement

- Firstly generate boilerplate & connect to database (mongodb via Mongoose ODM)

- Mongoose version must be greater than 6.x.x

- For existing project use mongocat-sync to migrate to denormable schema (We are working on it, it's not available yet)

- Setup providers & consumers carefully

- Follow linear approach, one collection can consume many denormalized data from many provider

- A provider can consume many denormalized data from other providers too but never create big bang

- Big bang creates when you are consuming from a collection at the same time provider denorbmalized data to that consumer too.

## Documentation

#### Provider

```js
import { provider } from 'mongocat';

const CategorySchema = new Schema(
  {
    title: String,
    slug: String,
    icon: String,
    status: String,
  },
  { timestamps: true }
);

CategorySchema.plugin(
  provider({
    toRef: 'Category',
    keyFields: ['title', 'slug', 'icon'],
    ignoredFields: ['status'],
  })
);

export const Category = model('Category', CategorySchema);
```

```js
import { provider } from 'mongocat';

const UserSchema = new Schema(
  {
    name: String,
    username: String,
    email: String,
    status: String,
  },
  { timestamps: true }
);

UserSchema.plugin(
  provider({
    toRef: 'User',
    keyFields: ['name', 'username', 'email', 'status'],
  })
);

export const User = model('User', UserSchema);
```

#### Consumer

```js
import { watchConsumer } from 'mongocat';

const BlogSchema = new Schema({
  title: String,
  slug: String,
  category: new Schema({
    _id: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
    },
    title: String,
    slug: String,
    icon: String,
  }),
  status: Boolean,
});

BlogSchema.plugin(
  watchConsumer({
    toPath: 'category',
    key: '_id',
    strict: true,
    fromRef: 'Category',
    toRef: 'Blog',
    changeStreamEnabled: false, // sync updatesfrom third party source
  })
);

export const Blog = model('Blog', BlogSchema);
```

### Frontend Payloads

- Blog:

  ```js
    {
       title: "Mongocat is joss",
       category: {
          _id: "62960300da98cc1aba3e9ee2"
       },
       status: true
    }
  ```

```js
  {
     title: "Docker is joss",
     category: {
        _id: "62960300da98cc1aba3e9ee2"
     },
     tags: [
      { _id: "62960300da98cc1aba3e9ee2" },
      { _id: "62960300da98cc1aba3e9ee2" }
     ],
     status: true
  }
```
