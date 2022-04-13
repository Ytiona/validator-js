# validatorjs
### 一款简单，灵活，多功能的表单校验库
>支持必填限制、类型校验、自定义正则、自定义校验函数、自定义message钩子等；封装了一系列基础的格式校验函数。


---


基于怎么用，再去怎么实现；参考了async-validator库的接口设计，融入了一些自己的想法；用到设计模式做了一些优化。


## 使用介绍：

```js
const rules = {
  name: { required: true, message: "请输入姓名" },
  phone: [
    { required: true, message: "请输入手机号码" },
    // 这里用Validator上的预设正则，也可以自定义正则
    { pattern: Validator.pattern.phone, message: "请输入正确的手机号码" },
  ],
};

const form = {
  name: "",
  phone: "156",
};

const validator = new Validator({
  rules,
});

// 所有字段校验
validator
  .validate(form)
  .then(() => {
    console.log("validate success");
  })
  .catch((errs) => {
    console.log("validate fail");
    /**
     * 输出：
     *  {
     *    name: { required: true, message: '请输入姓名' },
     *    phone: { pattern: Validator.pattern.phone, message: '请输入正确的手机号码' }
     * }
     */
    console.log(errs);
  });

// 指定字段校验
validator
  .validateField("phone", form)
  .then(() => {
    console.log("validate success");
  })
  .catch((err) => {
    console.log("validate fail");
    /**
     * 输出：
     * { pattern: Validator.pattern.phone, message: '请输入正确的手机号码' }
     */
    console.log(err);
  });
```
> 最基本的使用如上，然而这只是冰山一角

### 关于 rules 的详细配置：
> 格式或被md识别为表格列间隔符了，所以用/代替

| 属性    | 说明                                                                                           | 类型                                              |
| --------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| required  | 是否必填                                                                                     | Boolean                                             |
| type      | 类型校验，可设置：string/number/boolean/function/float/integer/array/object/date/regexp                     | String                                                |
| pattern   | 正则校验                                                                                     | Regexp                                              |
| validator | 自定义校验函数，支持异步，返回一个Promise实例；可以通过Promise.reject()或抛出错误来自定义message | () => Boolean/Promise<undefined/string>/never |
| maxlength | 最大长度                                                                                     | Number                                              |
| minlength | 最小长度                                                                                     | Number                                              |
| enum      | 枚举                                                                                           | Array                                               |
| message   | 错误信息，如果是函数，则会被当成钩子被执行                                  | String/Function                                     |


### message钩子：
有时我们需要在验证不通过时，弹出提示，这时就可以使用message钩子
``` js
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

### 单独配置某个规则的message钩子：
``` js
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

### transform（验证前处理值）：
有时我们将变量绑定了数值输入框，然而值是string类型，这时如果配置了type: 'number'，则无论如何都会校验不通过(当然vue可以使用v-model.number来解决这个问题)；
又或是某个字符串值需要进行trim后进行验证，所以都需要transform配置的存在；
``` js
const rules = {
  name: [
    { required: true, message: '请输入姓名' },
    { maxlength: 4, message: '姓名最长4位' }
  ],
  age: { type: 'number', message: '请输入正确的年龄' }
}

const transform = {
  name: value => value.trim(),
  age: value => Number(value)
}

const validator = new Validator({
  rules,
  transform
})

validator.validate({
  // 通过transform转换，name和age都会被校验通过，
  name: 'liyu ',
  age: '18'
}).then(() => {
  console.log('validate success');
}).catch(errs => {
  console.log('validate fail');
})

```

> 使用介绍如上，更详细内容及源码请访问gitee仓库：
> https://gitee.com/ytiona/validatorjs


***

## 源码开发记录：

最基础的几个功能源码：
> required\type\pattern\validator
``` js
 class Validator {
  _rules = {};
  constructor(rules) {
    Object.keys(rules).forEach(field => {
      const item = rules[field];
      // 格式统一
      this._rules[field] = Array.isArray(item) ? item : [item];
    });
  }
  validate(form) {
    const { _rules } = this;
    const tasks = Object.keys(_rules).map(field => this.validateField(field, form));
    return new Promise(async (resolve, reject) => {
      const validateResult = await Promise.allSettled(tasks);
      // 过滤出验证失败的项
      const errors = validateResult.filter(item => item.status === 'rejected');
      if (errors.length > 0) {
        const errorsMap = {};
        errors.forEach(err => {
          // 字段名映射
          errorsMap[err.reason.field] = err.reason.rule;
        })
        return reject(errorsMap);
      }
      return resolve();
    })
  }
  validateField(field, form) {
    const { _rules } = this;
    // 如果规则中不存在，则认定为校验通过
    if(!_rules[field]) return Promise.resolve();
    return new Promise(async (resolve, reject) => {
      const currentRules = _rules[field];
      for (let i = 0, len = currentRules.length; i < len; i++) {
        const rule = currentRules[i];
        const { oneOf, isEmpty, capitalize, isRegexp, isFunction } = Validator;
        if(rule.required) {
          if(isEmpty(form[field])) {
            return reject({ field, rule });
          }
        }
        if(rule.type) {
          const { type } = rule;
          // 有效的type，添加对应的类型校验
          if(oneOf(type, Validator.types)) {
            // 使用Validator类上静态方法，类型校验
            if(!Validator[`is${capitalize(type)}`](form[field])) {
              return reject({ field, rule });
            }
          } else {
            console.warn(`There is a type in field ${field} that is unsupported`);
          }
        }
        if(rule.pattern) {
          const { pattern } = rule;
          // 有效的正则，添加正则校验
          if(isRegexp(pattern)) {
            if(!pattern.test(form[field])) {
              return reject({ field, rule });
            }
          } else {
            console.warn(`There is a pattern in field ${field} that is not of type regexp`);
          }
        }
        if(rule.validator) {
          const { validator } = rule;
          // 自定义校验
          if(isFunction(validator)) {
            try {
              const validRes = validator(form[field]);
              if(validRes instanceof Promise) {
                // 如果validRes是promise.reject则会被下面catch捕获
                await validRes;
              } else if(!validRes) {
                // 自定义validator校验不通过
                return reject({ field, rule })
              }
            } catch (err) {
              let errMsg = err;
              // 取error对象中的message或reject对象中的message
              if(typeof(err) === 'object') {
                errMsg = err.message;
              }
              // 捕获自定义validator中的异常和Promise.reject
              return reject({
                field,
                rule: {
                  ...rule,
                  message: errMsg || rule.message
                }
              });
            }
          } else {
            console.warn(`There is a validator in field ${field} that is not of type function`);
          }
        }
      }
      // 如果走到这里没有被reject掉，则代表校验通过
      return resolve();
    })
  }
}
```
可以看到**validateField**里面为了判断规则配置，写了一堆的if，而且逻辑全部都堆在了这个函数中，后续维护起来会非常麻烦，比如增加一个校验配置，又或是改变校验规则的优先级顺序。

所以就想着用设计模式来优化一下，第一时间想到的是**策略模式**，但似乎暴露给外部的 rules 配置，就是策略模式的一种应用，里面某个规则的实现就是具体的策略；

仔细一想，像这种规则一个个串联起来，只要有一个校验不通过，则会终止，好像和**职责链模式**挺像的，话不多说，开干。


### 使用职责链模式优化：
``` js
class Validator {

  validateField(field, form) {
    const { _rules } = this;
    // 如果规则中不存在，则认定为校验通过
    if(!_rules[field]) return Promise.resolve();
    return new Promise(async (resolve, reject) => {
      const currentRules = _rules[field];

      for(const rule of currentRules) {
        // 创建职责链
        const chain = [
          this._validateRequired,
          this._validateType,
          this._validatePattern,
          this._customValidate
        ]
        // 执行职责链
        for(const validator of chain) {
          const validateRes = await validator(rule, form[field], field);
          let errMsg;
          let pass = validateRes;
          // 兼容校验函数抛出自定义message
          if(typeof(validateRes) === 'object') {
            pass = validateRes.pass;
            errMsg = validateRes.message;
          }
          // 校验不通过，中断职责链，返回校验结果
          if(!pass) {
            return reject({ 
              field, 
              rule: {
                ...rule,
                message: errMsg || rule.message
              }
            });
          }
        }
      }
      return resolve();
    })
  }

  // 必填校验
  _validateRequired(rule, value): boolean { ... }

  // 类型校验
  _validateType(rule, value, field): boolean { ... }

  // 正则校验
  _validatePattern(rule, value, field): boolean { ... }

  // 自定义校验，返回值特定情况需要特殊处理，因为有时候需要自定义message
  async _customValidate(rule, value, field): boolean | Promise<undefined | string> { ... }
}
```

可以看到**validateField**中的校验都被各自封装了，只需要**保证他们返回的结果一致**；
这样就可以在**validateField**中做**职责链的中断处理**，而**校验函数只负责接收参数，返回校验结果**；

经过设计模式改造后，如果需要增加判断规则，只需再对其封装，然后**往chain变量中添加就行了**；
如果需要改变校验规则的优先级，则**只需调整他们在数组中的顺序**就可以了。


### 设计模式优化后，增加maxlength、minlength、enum校验：
> 实际上这些校验都可以通过自定义validator来实现，但是感觉违背了封装的初衷；
``` js
class Validator {
  validateField(field, form) {
    const { _rules } = this;
    // 如果规则中不存在，则认定为校验通过
    if(!_rules[field]) return Promise.resolve();
    return new Promise(async (resolve, reject) => {
      const currentRules = _rules[field];

      for(const rule of currentRules) {
        // 创建职责链
        const chain = [
          this._validateRequired,
          this._validateType,
          this._validatePattern,

          // 这里改动的只增加了这三行代码
          // 且这三个校验优先于自定义校验
          this._validateMaxlen,
          this._validateMinlen,
          this._validateEnum,

          this._customValidate
        ]
        // 执行职责链
        for(const validator of chain) {
          const validateRes = await validator(rule, form[field], field);
          let errMsg;
          let pass = validateRes;
          // 兼容校验函数抛出自定义message
          if(typeof(validateRes) === 'object') {
            pass = validateRes.pass;
            errMsg = validateRes.message;
          }
          // 校验不通过，中断职责链，返回校验结果
          if(!pass) {
            return reject({ 
              field, 
              rule: {
                ...rule,
                message: errMsg || rule.message
              }
            });
          }
        }
      }
      return resolve();
    })
  }
    // 最大长度校验
  _validateMaxlen(rule, value, field) {
    const { maxlength } = rule;
    if(maxlength) {
      if(Validator.isInteger(maxlength) && maxlength > 0) {
        return value.length <= maxlength;
      }
      console.warn(`There is a maxLength in the field ${field} that is not a positive integer type`)
    }
    return true;
  }

    // 最小长度校验
  _validateMinlen(rule, value, field) { ... }
  
  // 枚举校验
  _validateEnum(rule, value, field) {...}
}
```
可以看到，增加了三个规则，并没有对validateField做太多改动。


> 其余关于transform、messageHook的扩展，感兴趣的可以看源码：
> https://gitee.com/ytiona/validatorjs



### 参考资料：

1.https://github.com/yiminghe/async-validator; 

2.《JavaScript 设计模式与开发实践》;



