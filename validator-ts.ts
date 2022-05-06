/**
  * @Author: LiYu
  * @Date: 2022-03-05 22:08:07
  * @LastEditors: LiYu
  * @LastEditTime: 2022-03-16 22:15:49
  * @Description: 表单校验类
  */

enum Types {
  string = 'string', 
  number = 'number', 
  boolean = 'boolean', 
  function = 'function', 
  float = 'float', 
  integer = 'integer', 
  array = 'array', 
  object = 'object', 
  date = 'date', 
  regexp = 'regexp'
}

type Message = string | Function;

interface RuleItem {
  required?: boolean,
  type?: keyof typeof Types,
  pattern?: RegExp,
  validator?: (value: any) => boolean | Promise<undefined | string> | never,
  maxlength?: number,
  minlength?: number,
  enum?: any[],
  message?: Message
}

interface Rules {
  [P: string]: RuleItem | RuleItem[]
}

interface Config {
  rules: Rules,
  transform?: {
    [P: string]: (value: any) => any
  }, 
  messageHook?: (message: Message) => any
}

interface ErrRes extends RuleItem{
  field?: string,
  rule?: RuleItem
}

class Validator {
  static readonly pattern = Object.freeze({
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
  });

  // rules中的type取值
  static readonly types = Object.freeze(Object.keys(Types));

  _rules: Rules = {};
  _transform;
  _messageHook;

  /**
   * @param {Object} rules 必填 校验规则
   * @param {Object} transform 选填 字段值的转换配置
   * @return {validator}
   */
  constructor(config: Config) {
    if (!Validator.isObject(config)) {
      throw new Error('config must be an object');
    }

    const { rules, transform, messageHook } = config;

    if (!Validator.isObject(rules)) {
      throw new Error('rules must be an object');
    }
    if (transform && !Validator.isObject(transform)) {
      throw new Error('transform must be an object');
    }
    if (messageHook && !Validator.isFunction(messageHook)) {
      throw new Error('messageHook must be an function');
    }

    this._transform = transform;
    this._messageHook = messageHook;

    Object.keys(rules).forEach((field: string) => {
      const item = rules[field];
      // 格式统一
      this._rules[field] = (Validator.isArray(item) ? item : [item]) as RuleItem;
    });
  }

  /**
   * @description: 校验所有rules中字段
   * @param {Object} form 被校验的表单
   * @return {Promise}
   */
  validate(form: object): Promise<void> {
    if (!Validator.isObject(form)) {
      throw new Error('Form parameter is not an object');
    }

    const { _rules } = this;

    const tasks = Object.keys(_rules).map(field => this.validateField(field, form, true));

    return new Promise<void>(async (resolve, reject) => {
      const validateResult = await Promise.allSettled(tasks);
      // 过滤出验证失败的项
      const errors = validateResult.filter(item => item.status === 'rejected') as { status: "rejected"; reason: ErrRes; }[];
      if (errors.length > 0) {
        const errorsMap: { [P: string]: RuleItem } = {};
        errors.forEach(err => {
          // 字段名映射
          if(typeof(err.reason.field) === 'string') {
            errorsMap[err.reason.field] = err.reason.rule!;
          }
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
   * @param {Boolean} fieldWrap 是否包含字段
   * @return {Promise}
   */
  validateField(field: string, form: { [P: string]: any }, fieldWrap: boolean = false): Promise<void> {
    if (!Validator.isObject(form)) {
      throw new Error('Form parameter is not an object');
    }

    const { _rules, _transform = {} } = this;

    // 如果规则中不存在，则认定为校验通过
    if (!_rules[field]) return Promise.resolve();

    return new Promise<void>(async (resolve, reject: (err: ErrRes) => void) => {
      const currentRules = _rules[field] as RuleItem[];
      const currentTransform = _transform[field] || (value => value);

      for (const rule of currentRules) {

        // 创建职责链
        const chain = [
          this._validateRequired,
          this._validateType,
          this._validatePattern,
          this._validateMaxlen,
          this._validateMinlen,
          this._validateEnum,
          this._customValidate
        ]

        // 执行职责链
        for (const validator of chain) {
          const validateRes = await validator(rule, currentTransform(form[field]), field);
          let errMsg: string = '';
          let pass = validateRes;
          // 返回类型兼容自定义message
          if (typeof (validateRes) === 'object') {
            pass = validateRes.pass;
            errMsg = validateRes.message;
          }
          // 校验不通过
          if (!pass) {
            const message = errMsg || rule.message;
            // message配置为函数，执行
            if (Validator.isFunction(message)) {
              (message as Function)();
            } else if (this._messageHook) {
              // 存在全局的messageHook
              this._messageHook(message as Message);
            }
            const finalRule = { ...rule, message };
            if (fieldWrap) {
              // 中断职责链，返回包含字段名的校验结果
              return reject({ field, rule: finalRule });
            }
            // 中断职责链
            return reject(finalRule);
          }
        }
      }
      return resolve();
    })
  }

  // 必填校验
  _validateRequired(rule: RuleItem, value: any): boolean {
    if (rule.required) {
      return !Validator.isEmpty(value)
    }
    return true;
  }

  // 类型校验
  _validateType(rule: RuleItem, value: any, field: string): boolean {
    if(Validator.isEmpty(value)) return true;
    const { type } = rule;
    if (type) {
      const { oneOf, capitalize } = Validator;
      // 有效的type，添加对应的类型校验
      if (oneOf(type, Validator.types)) {
        // 使用Validator类上静态方法，类型校验
        const typeValidateFn = `is${capitalize(type)}`;
        // 拼接出来的方法名，ts认为不能确保在Validator上存在，所以通过断言做担保（as keyof typeof Validator）
        // 以上只是保证了typeValidateFn是Validator上的属性，而不是指定的类型校验方法
        // 所以再做了一层断言：as (value: any) => boolean，确保获取到的就是我想要的函数类型
        return (Validator[typeValidateFn as keyof typeof Validator] as (value: any) => boolean)(value);
      } else {
        console.warn(`There is a type in field ${field} that is unsupported`);
      }
    }
    return true;
  }

  // 正则校验
  _validatePattern(rule: RuleItem, value: any, field: string): boolean {
    if(Validator.isEmpty(value)) return true;
    const { pattern } = rule;
    if (pattern) {
      // 有效的正则，添加正则校验
      if (Validator.isRegexp(pattern)) {
        return pattern.test(value)
      } else {
        console.warn(`There is a pattern in field ${field} that is not of type regexp`);
      }
    }
    return true;
  }

  // 自定义校验
  async _customValidate(rule: RuleItem, value: any, field: string): Promise<boolean | {
    pass: boolean,
    message: string
  }> {
    if(Validator.isEmpty(value)) return true;
    const { validator } = rule;
    if (validator) {
      // 自定义校验
      if (Validator.isFunction(validator)) {
        try {
          const validRes = validator(value);
          if (validRes instanceof Promise) {
            // 如果validRes是promise.reject则会被下面catch捕获
            await validRes;
          } else if (!validRes) {
            // 自定义非异步validator校验不通过
            return false;
          }
        } catch (err: any) {
          // 捕获自定义validator中的异常和Promise.reject
          let errMsg: string = '';
          if(typeof err === 'string') {
            errMsg = err;
          }
          // 取error对象中的message或reject对象中的message
          if (typeof (err) === 'object') {
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
  _validateMaxlen(rule: RuleItem, value: any, field: string): boolean {
    if(Validator.isEmpty(value)) return true;
    const { maxlength } = rule;
    if (maxlength) {
      if (Validator.isInteger(maxlength) && maxlength > 0) {
        return value.length <= maxlength;
      }
      console.warn(`There is a maxLength in the field ${field} that is not a positive integer type`)
    }
    return true;
  }

  // 最小长度校验
  _validateMinlen(rule: RuleItem, value: any, field: string): boolean {
    if(Validator.isEmpty(value)) return true;
    const { minlength } = rule;
    if (minlength) {
      if (Validator.isInteger(minlength) && minlength > 0) {
        return value.length >= minlength;
      }
      console.warn(`There is a minlength in the field ${field} that is not a positive integer type`)
    }
    return true;
  }

  // 枚举校验
  _validateEnum(rule: RuleItem, value: any, field: string): boolean {
    if(Validator.isEmpty(value)) return true;
    const { enum: list } = rule;
    if (list) {
      if (Validator.isArray(list)) {
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
  static capitalize(str: string): string | never {
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
  static oneOf(value: any, validList: readonly any[]): boolean {
    if (!Validator.isArray(validList)) {
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
  static isEmpty(value: any): boolean {
    return value === '' || value === null || value === undefined;
  }

  /**
   * @description: 是否字符串
   * @param {*} value
   * @return {Boolean}
   */
  static isString(value: any): boolean {
    return typeof value === 'string';
  }

  /**
   * @description: 是否数字（NaN除外，但不排除Infinity）
   * @param {*} value
   * @return {Boolean}
   */
  static isNumber(value: any): boolean {
    return typeof value === 'number' && !isNaN(value);
  }

  /**
   * @description: 是否布尔
   * @param {*} value
   * @return {Boolean}
   */
  static isBoolean(value: any): boolean {
    return typeof value === 'boolean';
  }

  /**
   * @description: 是否函数
   * @param {*} value
   * @return {Boolean}
   */
  static isFunction(value: any): boolean {
    return typeof value === 'function';
  }

  /**
   * @description: 是否正则
   * @param {*} value
   * @return {Boolean}
   */
  static isRegexp(value: any): boolean {
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
  static isInteger(value: any): boolean {
    return Validator.isNumber(value) && parseInt(value, 10) === value;
  }

  /**
   * @description: 是否浮点小数
   * @param {*} value
   * @return {Boolean}
   */
  static isFloat(value: any): boolean {
    return Validator.isNumber(value) && !Validator.isInteger(value);
  }

  /**
   * @description: 是否数组
   * @param {*} value
   * @return {Boolean}
   */
  static isArray(value: any): boolean {
    return Array.isArray(value);
  }

  /**
   * @description: 是否对象
   * @param {*} value
   * @return {Boolean}
   */
  static isObject(value: any): boolean {
    return typeof value === 'object' && !Validator.isArray(value);
  }

  /**
   * @description: 是否日期对象
   * @param {*} value
   * @return {Boolean}
   */
  static isDate(value: any): boolean {
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
  static isValidDate(value: any): boolean {
    return isNaN(value) && !isNaN(Date.parse(value));
  }

  /**
   * @description: 是否URL
   * @param {*} value
   * @return {Boolean}
   */
  static isUrl(value: any): boolean {
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
  static isPhone(value: any): boolean {
    return Validator.pattern.phone.test(value);
  }

  /**
   * @description: 是否电话号码
   * @param {*} value
   * @return {Boolean}
   */
  static isTel(value: any): boolean {
    return Validator.pattern.tel.test(value);
  }

  /**
   * @description: 是否邮箱
   * @param {*} value
   * @return {Boolean}
   */
  static isEmail(value: any): boolean {
    return Validator.pattern.email.test(value);
  }

  /**
   * @description: 是否汉字
   * @param {*} value
   * @return {Boolean}
   */
  static isChinese(value: any): boolean {
    return Validator.pattern.chinese.test(value);
  }

  /**
   * @description: 是否身份证
   * @param {*} value
   * @return {Boolean}
   */
  static isIdCard(value: any): boolean {
    return Validator.pattern.idCard.test(value);
  }

  /**
   * @description: 是否IPv4
   * @param {*} value
   * @return {Boolean}
   */
  static isIp(value: any): boolean {
    return Validator.pattern.ip.test(value);
  }

  /**
   * @description: 是否邮政编码
   * @param {*} value
   * @return {Boolean}
   */
  static isPostalCode(value: any): boolean {
    return Validator.pattern.postalCode.test(value);
  }
}

export default Validator;

