### Validatorjs
> 一个校验表单的工具类；支持必填限制、类型校验、自定义正则、自定义校验函数等、message钩子、值前置转换配置；封装了一系列基础的格式校验函数。

### 基本使用：
```
const rules = {
  // 一个基础的必填校验配置，必填（非：''\null\undefined）
  name: { required: true, messge: '请填写名称' },
  phone: { required: true, message: '请输入手机号码' }
}
const validator = new Validator({ rules });

// 执行校验
validator.validate({
  name: '',
  phone: null
}).then(() => {
  // 校验通过
  console.log('validate success');
}).catch(errs => {
  // 校验不通过
  console.log('validate fail');
  /*
    输出字段名对应其校验未通过的那条规则配置：
      { 
        name: { required: true, messge: '请填写名称' },
        phone: { required: true, message: '请输入手机号码' }
      }
  */
  console.log(errs);
})
```

***
### 指定字段校验
```
const rules = {
  name: { required: true, messge: '请填写名称' },
}

const form = {
  name: ''
}

const validator = new Validator({ rules });

validator.validateField('name', form).then(() => {
  console.log('validate success');
}).catch(err => {
  console.log('validate fail');
  /**
    * 输出：{ required: true, messge: '请填写名称' }
  */
  console.log(err);
})
```

***

### 其他校验
```
const rules = {
  name: { required: true, messge: '请填写名称' },
  phone: [
    { required: true, messge: '请填写手机号码' },
    // 手机号正则校验，可直接使用Validator上预设的正则
    { pattern: Validator.pattern.phone, messge: '请填写正确的手机号码' }
  ],
  gender: [
    { required: true, messge: '请填写性别' },
    // 枚举校验
    { enum: ['男', '女', '保密'], messge: '性别只能为：男、女、保密' }
  ],
  age: [
    { required: true, messge: '请填写性别' },
    {
      // 自定义校验函数
      // 年龄应该为正整数，此处仅做自定义校验的使用示范
      validator: value => Validator.isInteger(value),
      message: '年龄必须为整数'
    }
  ],
  account: [
    { required: true, messge: '请填写性别' },
    /**
      * 类型校验，包含：
      * string     字符串
      * number     数字
      * boolean    布尔值
      * function   函数
      * float      浮点数
      * integer    整数
      * array      数组
      * object     对象
      * date       日期
      * regexp     正则
    */
    { type: 'string', message: '账号格式错误' }
  ],
  password: [
    { required: true, messge: '请输入密码' },
    // 最小长度校验
    { minlength: 6, message: '密码最少6位' },
    // 最大长度校验
    { maxlength: 16, message: '密码最多16位' },
  ]
}
```

***


### 一个配置对象中叠加多个校验方式
```
const rules = {
  phone: [
    { required: true, message: '请填写手机号码' },

    // type和pattern叠加使用，限制了值为字符串类型的手机号码格式
    // 校验执行优先级：required > type > pattern > maxlength > minlength > enum > validator
    { type: 'string', pattern: Validator.pattern.phone, message: '请填写正确的手机号码' }
  ]
}
```

***

### 异步validator及自定义错误信息
```
const SUCCESS_CODE = 0;

const rules = {
  password: [
    { required: true, message: '请输入密码' },
    {
      validator(value) {
        return new Promise((resolve, reject) => {
          // 模拟登录请求
          loginRequest({
            account: 'liyu',
            password: value
          }).then(res => {
            if(res.code === SUCCESS_CODE) {
              // resolve 校验通过
              return resolve();
            }
            // reject 校验不通过，且可传入错误信息
            return reject(res.message || '未知错误');
          })
        })
      }
    }
  ]
}

// 模拟请求
function loginRequest({
  account,
  password
} = {}) {
  return new Promise(resolve => {
    setTimeout(() => {
      if(password === '123456') {
        return resolve({
          code: SUCCESS_CODE,
          message: '密码正确'
        })
      }
      return resolve({
        code: 1,
        message: '密码错误'
      })
    }, 200)
  })
}
```

#### 对于同步的validator自定义错误信息
```
const rules = {
  password: [
    { required: true, message: '请输入密码' },
    {
      validator(value) {
        if(value !== 'password') {
          // 抛出错误以自定义错误信息
          throw new Error('密码错误');
          
          // 返回Promise.reject自定义错误信息
          return Promise.reject('密码错误');
        }
      }
    }
  ]
}
```


***


### transform，校验值的前置处理
```
const rules = {
  name: [
    { required: true, message: '请填写姓名' },
    { minlength: 2, message: '姓名最少2位' }
  ]
}

const transform = {
  // 将name值trim后再进行校验
  name: value => value.trim()
}

const validator = new Validator({
  rules,
  transform
})

validator.validate({
  // 此处有一个空格
  name: 'l ' 
}).then(() => {
  console.log('validate success');
}).catch(errs => {
  console.log('validate fail');
  /**
    * 输出：
    *   name进过trim后，长度为1，所以校验不通过
    *  { name: { minlength: 2, message: '姓名最少2位' } }
  */
  console.log(errs);
})
```

***

### message钩子
```
const rules = {
  name: { required: true, message: '请输入姓名' }
}

const validator = new Validator({
  rules,
  // 校验不通过则会调用该钩子函数
  messageHook(message) {
    console.log(message);
  }
})

validator.validate({
  name: null
}).then(() => {
  console.log('validate success');
}).catch(errs => {
  console.log('validate fail');
})

/**
  * 控制台打印：
  *  validate fail
  *  请输入姓名
*/
```
#### 指定字段配置message钩子
```
const rules = {
  name: { 
    required: true, 
    // message可以写成一个函数
    message() {
      console.log('请输入姓名');
    }
  }
}

validator.validate({
  name: null
}).then(() => {
  console.log('validate success');
}).catch(errs => {
  console.log('validate fail');
})

/**
  * 控制台打印：
  *  validate fail
  *  请输入姓名
*/
```