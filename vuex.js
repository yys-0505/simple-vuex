//refer
//https://blog.csdn.net/qq_36407748/article/details/102778062
//https://segmentfault.com/a/1190000020861804
//https://blog.csdn.net/yehuozhili/article/details/102810777
const forEach = (obj, cb) => {
  Object.keys(obj).forEach(key => {
    cb(key, obj[key]);
  })
}

let Vue
class Store {
  constructor(options = {}) {
    //核心代码: 保证数据都是响应式的
    this.vm = new Vue({
      data() {
        return {
          state: options.state
        }
      }
    })
    this._modules = new ModuleCollection(options);
    this.getters = {};
    this.mutations = {};
    this.actions = {};
    this._subscribes = [];
    this.subscribe = (fn) => {
      this._subscribes.push(fn);
    }
  
    // 把数据格式化成一个想要的树结构
    installModule(this, this.state, [], this._modules.root);

    this.commit = (type, payload) => {
      this.mutations[type].forEach(cb => cb(payload))
    }
  
    this.dispatch = (type, payload) => {
      this.actions[type].forEach(cb => cb(payload))
    }

    let plugins = options.plugins || []
    plugins.forEach((fn)=>(fn(this)))
  }

  // 类的属性访问器
  get state() {
    return this.vm.state
  }
}

/**
 * @explain { 安装模块 }
 *    @param { store }  整个store 
 *    @param { rootState }  当前的根状态
 *    @param { path }  为了递归来创建的
 *    @param { rootModule }  从根模块开始安装
 */

const installModule = (store, rootState, path, rootModule) => {
  if (path.length > 0) {
    // [a, b]
    // 是儿子,儿子要找到爸爸将自己的状态 放到上面去
    let parent = path.slice(0, -1).reduce((root, current) => {
      return root[current]
    }, rootState)
    // vue 不能在对象上增加不存在的属性 否则不会导致视图更新
    Vue.set(parent, path[path.length - 1], rootModule.state);
    // parent为rootState.a, {age:1,b:{x:y}}
    // 实现了查找挂载数据格式
  }
  let module = store._modules.root
  let namespace = path.reduce((pre,cur)=>{
      module = module._children[cur]
      return pre + (module._rawModule.namespaced ? cur+'/' : '')
  },'')

  // 以下代码都是在处理  模块中 getters actions mutation
  let getters = rootModule._rawModule.getters;
  if (getters) {
    forEach(getters, (getterName, fn) => {
      if(namespace){
        getterName = namespace + getterName
      }
      // 重新构造 this.getters 对象
      Object.defineProperty(store.getters, getterName, {
        get() {
          return fn(rootModule.state); // 让对应的函数执行
        }
      });
    })
  }
  let mutations = rootModule._rawModule.mutations;
  if (mutations) {
    forEach(mutations, (mutationName, fn) => {
      if(namespace){
        mutationName = namespace + mutationName
      }
      let tmp = store.mutations[mutationName] || [];
      tmp.push((payload) => {
        fn(rootModule.state, payload);
        // 发布 让所有的插件订阅依次执行
        store._subscribes.forEach(fn => fn({ type: mutationName, payload }, rootState));
      })
      store.mutations[mutationName] = tmp;
    })
  }
  let actions = rootModule._rawModule.actions;
  if (actions) {
    forEach(actions, (actionName, fn) => {
      if(namespace){
        actionName = namespace + actionName
      }
      let tmp = store.actions[actionName] || [];
      tmp.push((payload) => {
        fn(store, payload);
      })
      store.actions[actionName] = tmp;
    })
  }
  // 挂载儿子
  forEach(rootModule._children, (moduleName, module) => {
    installModule(store, rootState, path.concat(moduleName), module)
  })
}

// 格式化 _modules
class ModuleCollection {
  constructor(options) {
    // 注册模块 将模块注册成树结构
    this.register([], options);
  }
  register(path, rootModule) {
    let module = { // 将模块格式化
      _rawModule: rootModule,
      _children: {},
      state: rootModule.state
    }
    if (path.length == 0) {
      // 如果是根模块 将这个模块挂在到根实例上
      this.root = module;
    } else {
      // 递归调用reduce方法
      // 通过 _children 属性进行查找
      // 如path=['mod1', 'mod2', 'mod3'], 找到名叫mod2的module,给它的children添加mod3属性, 值为新定义的module
      let parent = path.slice(0, -1).reduce((root, current) => {
        return root._children[current]
      }, this.root)
      parent._children[path[path.length - 1]] = module
    }
    // 看当前模块是否有modules , 如果有modules开始再次注册
    if (rootModule.modules) {
      forEach(rootModule.modules, (moduleName, module) => {
        // 下面的path相当于父级的path,每次与子module结合,组成新的path进行注册
        this.register(path.concat(moduleName), module)
      })
    }
  }
}

const install = _Vue => {
  Vue = _Vue // 用一个变量接收 _Vue 构造器
    // 全局注册一个混入，影响注册之后所有创建的每个 Vue 实例
  Vue.mixin({
    beforeCreate() {
      //判断根实例 有木有传入store 数据源,
      //如果传入了, 就把它放到实例的 $store上
      const options = this.$options
      // store injection
      if (options.store) {
        this.$store = options.store
      } else if (options.parent && options.parent.$store) {
        // 2. 子组件去取父级组件的$store属性
        this.$store = this.$parent.$store
      }
    }
  })
}

export default {
  install,
  Store
}