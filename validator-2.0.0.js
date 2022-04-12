/**
  * @Author: LiYu
  * @Date: 2022-03-05 22:08:07
  * @LastEditors: LiYu
  * @LastEditTime: 2022-03-16 22:15:49
  * @Description: 表单校验类，constructor增加transform配置
  */
 class Validator {
  static pattern = {
    // Email地址
    email: /^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/,
    // 手机号码
    phone: /^(13[0-9]|14[5|7]|15[0|1|2|3|4|5|6|7|8|9]|18[0|1|2|3|5|6|7|8|9])\d{8}$/,
    // InternetURL
    url: /[a-zA-z]+:\/\/[^\s]*/,
    // 电话号码("XXX-XXXXXXX"、"XXXX-XXXXXXXX"、"XXX-XXXXXXX"、"XXX-XXXXXXXX"、"XXXXXXX"和"XXXXXXXX)
    tel: /^((\d{3,4}-)|\d{3.4}-)?\d{7,8}$/,
    // 汉字
    chinese: /^[\u4e00-\u9fa5]{0,}$/,
    // 身份证号(15位、18位数字)，最后一位是校验位，可能为数字或字符X
    idCard: /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/,
    // IPv4地址
    ip: /((2(5[0-5]|[0-4]\d))|[0-1]?\d{1,2})(\.((2(5[0-5]|[0-4]\d))|[0-1]?\d{1,2})){3}/,
    // 中国邮政编码
    postalCode: /[1-9]\d{5}(?!\d)/
  };

  // type取值
  static types = ['string', 'number', 'boolean', 'function', 'float', 'integer', 'array', 'object', 'date', 'regexp'];

  _rules = {};

  /**
   * @param {Object} rules 必填 校验规则
   * @param {Object} transform 选填 字段值的转换配置
   * @return {validator}
   */
  constructor(config) {
    let rules = config;
    if(Validator.isObject(config)) {
      rules = config.rules;
      const { transform  } = config;
      if(transform && !Validator.isObject(transform)) {
        throw new Error('transform must be an object');
      }
      this._transform = transform;
    }
    
    if (!Validator.isObject(rules)) {
      throw new Error('rules must be an object');
    }

    Object.keys(rules).forEach(field => {
      const item = rules[field];
      // 格式统一
      this._rules[field] = Validator.isArray(item) ? item : [item];
    });
  }

  /**
   * @description: 校验所有rules中字段
   * @param {Object} form 被校验的表单
   * @return {Promise}
   */
  validate(form) {
    if(!Validator.isObject(form)) {
      throw new Error('Form parameter is not an object');
    }

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

  /**
   * @description: 校验指定字段
   * @param {String} field 要校验的字段
   * @param {Object} form 被校验的表单
   * @return {Promise}
   */
  validateField(field, form) {
    if(!Validator.isObject(form)) {
      throw new Error('Form parameter is not an object');
    }

    const { _rules, _transform } = this;
    
    // 如果规则中不存在，则认定为校验通过
    if(!_rules[field]) return Promise.resolve();

    return new Promise(async (resolve, reject) => {
      const currentRules = _rules[field];
      const currentTransform = _transform[field] || (value => value);
      
      for(const rule of currentRules) {

        const chain = [
          this._validateRequired,
          this._validateType,
          this._validatePattern,
          this._customValidate,
          this._validateMaxlen,
          this._validateMinlen,
          this._validateEnum
        ]

        for(const validator of chain) {
          const validateRes = await validator(rule, currentTransform(form[field]), field);
          let errMsg;
          let pass = validateRes;
          if(typeof(validateRes) === 'object') {
            pass = validateRes.pass;
            errMsg = validateRes.message;
          }
          // 如果有一个校验不通过，则中断循环（职责链）
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
  _validateRequired(rule, value) {
    if(rule.required) {
      if(Validator.isEmpty(value)) {
        return false;
      }
    }
    return true;
  }

  // 类型校验
  _validateType(rule, value, field) {
    const { type } = rule;
    if(type) {
      const { oneOf, capitalize } = Validator;
      // 有效的type，添加对应的类型校验
      if(oneOf(type, Validator.types)) {
        // 使用Validator类上静态方法，类型校验
        if(!Validator[`is${capitalize(type)}`](value)) {
          return false;
        }
      } else {
        console.warn(`There is a type in field ${field} that is unsupported`);
      }
    }
    return true;
  }

  // 正则校验
  _validatePattern(rule, value, field) {
    const { pattern } = rule;
    if(pattern) {
      // 有效的正则，添加正则校验
      if(Validator.isRegexp(pattern)) {
        if(!pattern.test(value)) {
          return false;
        }
      } else {
        console.warn(`There is a pattern in field ${field} that is not of type regexp`);
      }
    }
    return true;
  }

  // 自定义校验
  async _customValidate(rule, value, field) {
    const { validator } = rule;
    if(validator) {
      // 自定义校验
      if(Validator.isFunction(validator)) {
        try {
          const validRes = validator(value);
          if(validRes instanceof Promise) {
            // 如果validRes是promise.reject则会被下面catch捕获
            await validRes;
          } else if(!validRes) {
            // 自定义非异步validator校验不通过
            return false;
          }
        } catch (err) {
          // 捕获自定义validator中的异常和Promise.reject
          let errMsg = err;
          // 取error对象中的message或reject对象中的message
          if(typeof(err) === 'object') {
            errMsg = err.message;
          }
          return {
            pass: false,
            message: errMsg
          }
        }
      } else {
        console.warn(`There is a validator in field ${field} that is not of type function`);
      }
    }
    return true;
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
  _validateMinlen(rule, value, field) {
    const { minlength } = rule;
    if(minlength) {
      if(Validator.isInteger(minlength) && minlength > 0) {
        return value.length >= minlength;
      }
      console.warn(`There is a minlength in the field ${field} that is not a positive integer type`)
    }
    return true;
  }

  // 枚举校验
  _validateEnum(rule, value, field) {
    const { enum: list } = rule;
    if(list) {
      if(Validator.isArray(list)) {
        return Validator.oneOf(value, list);
      }
      console.warn(`There is a minlength in the field ${field} that is not a positive array type`)
    }
    return true;
  }

  /**
   * @description: 首字符转大写
   * @param {String} str
   * @return {String}
   */
  static capitalize(str) {
    if (!Validator.isString(str)) {
      throw new Error('Parameter must be of string type');
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * @description: 判断值是否存在于validList中
   * @param {*} value
   * @param {*} validList
   * @return {Boolean}
   */
  static oneOf(value, validList) {
    if(!Validator.isArray(validList)) {
      throw new Error('validList must be of array type');
    }
    for (let i = 0; i < validList.length; i++) {
      if (value === validList[i]) {
        return true;
      }
    }
    return false;
  }

  /**
   * @description: 是否为空
   * @param {*} value
   * @return {Boolean}
   */
  static isEmpty(value) {
    return value === '' || value === null || value === undefined;
  }

  /**
   * @description: 是否字符串
   * @param {*} value
   * @return {Boolean}
   */
  static isString(value) {
    return typeof value === 'string';
  }

  /**
   * @description: 是否数字（NaN除外，但不排除Infinity）
   * @param {*} value
   * @return {Boolean}
   */
  static isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
  }

  /**
   * @description: 是否布尔
   * @param {*} value
   * @return {Boolean}
   */
  static isBoolean(value) {
    return typeof value === 'boolean';
  }

  /**
   * @description: 是否函数
   * @param {*} value
   * @return {Boolean}
   */
  static isFunction(value) {
    return typeof value === 'function';
  }

  /**
   * @description: 是否正则
   * @param {*} value
   * @return {Boolean}
   */
  static isRegexp(value) {
    if (value instanceof RegExp) {
      return true;
    }
    return false;
  }

  /**
   * @description: 是否整数
   * @param {*} value
   * @return {Boolean}
   */
  static isInteger(value) {
    return Validator.isNumber(value) && parseInt(value, 10) === value;
  }

  /**
   * @description: 是否浮点小数
   * @param {*} value
   * @return {Boolean}
   */
  static isFloat(value) {
    return Validator.isNumber(value) && !Validator.isTnteger(value);
  }

  /**
   * @description: 是否数组
   * @param {*} value
   * @return {Boolean}
   */
  static isArray(value) {
    return Array.isArray(value);
  }

  /**
   * @description: 是否对象
   * @param {*} value
   * @return {Boolean}
   */
  static isObject(value) {
    return typeof value === 'object' && !Validator.isArray(value);
  }

  /**
   * @description: 是否日期对象
   * @param {*} value
   * @return {Boolean}
   */
  static isDate(value) {
    return (
      typeof value.getTime === 'function' &&
      typeof value.getMonth === 'function' &&
      typeof value.getYear === 'function' &&
      !isNaN(value.getTime())
    );
  }

  /**
   * @description: 是否有效的日期字符串
   * @param {*} value
   * @return {Boolean}
   */
  static isValidDate(value) {
    return isNaN(value) && !isNaN(Date.parse(value));
  }

  /**
   * @description: 是否URL
   * @param {*} value
   * @return {Boolean}
   */
  static isUrl(value) {
    return (
      typeof value === 'string' &&
      value.length <= 2048 &&
      Validator.pattern.url.test(value)
    );
  }

  /**
   * @description: 是否手机号码
   * @param {*} value
   * @return {Boolean}
   */
  static isPhone(value) {
    return Validator.pattern.phone.test(value);
  }

  /**
   * @description: 是否电话号码
   * @param {*} value
   * @return {Boolean}
   */
  static isTel(value) {
    return Validator.pattern.tel.test(value);
  }

  /**
   * @description: 是否邮箱
   * @param {*} value
   * @return {Boolean}
   */
  static isEmail(value) {
    return Validator.pattern.email.test(value);
  }

  /**
   * @description: 是否汉字
   * @param {*} value
   * @return {Boolean}
   */
  static isChinese(value) {
    return Validator.pattern.chinese.test(value);
  }

  /**
   * @description: 是否身份证
   * @param {*} value
   * @return {Boolean}
   */
  static isIdCard(value) {
    return Validator.pattern.idCard.test(value);
  }

  /**
   * @description: 是否IPv4
   * @param {*} value
   * @return {Boolean}
   */
  static isIp(value) {
    return Validator.pattern.ip.test(value);
  }

  /**
   * @description: 是否邮政编码
   * @param {*} value
   * @return {Boolean}
   */
  static isPostalCode(value) {
    return Validator.pattern.postalCode.test(value);
  }
}