(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
/*globals Handlebars: true */
var base = require("./handlebars/base");

// Each of these augment the Handlebars object. No need to setup here.
// (This is done to easily share code between commonjs and browse envs)
var SafeString = require("./handlebars/safe-string")["default"];
var Exception = require("./handlebars/exception")["default"];
var Utils = require("./handlebars/utils");
var runtime = require("./handlebars/runtime");

// For compatibility and usage outside of module systems, make the Handlebars object a namespace
var create = function() {
  var hb = new base.HandlebarsEnvironment();

  Utils.extend(hb, base);
  hb.SafeString = SafeString;
  hb.Exception = Exception;
  hb.Utils = Utils;

  hb.VM = runtime;
  hb.template = function(spec) {
    return runtime.template(spec, hb);
  };

  return hb;
};

var Handlebars = create();
Handlebars.create = create;

exports["default"] = Handlebars;
},{"./handlebars/base":2,"./handlebars/exception":3,"./handlebars/runtime":4,"./handlebars/safe-string":5,"./handlebars/utils":6}],2:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];

var VERSION = "1.3.0";
exports.VERSION = VERSION;var COMPILER_REVISION = 4;
exports.COMPILER_REVISION = COMPILER_REVISION;
var REVISION_CHANGES = {
  1: '<= 1.0.rc.2', // 1.0.rc.2 is actually rev2 but doesn't report it
  2: '== 1.0.0-rc.3',
  3: '== 1.0.0-rc.4',
  4: '>= 1.0.0'
};
exports.REVISION_CHANGES = REVISION_CHANGES;
var isArray = Utils.isArray,
    isFunction = Utils.isFunction,
    toString = Utils.toString,
    objectType = '[object Object]';

function HandlebarsEnvironment(helpers, partials) {
  this.helpers = helpers || {};
  this.partials = partials || {};

  registerDefaultHelpers(this);
}

exports.HandlebarsEnvironment = HandlebarsEnvironment;HandlebarsEnvironment.prototype = {
  constructor: HandlebarsEnvironment,

  logger: logger,
  log: log,

  registerHelper: function(name, fn, inverse) {
    if (toString.call(name) === objectType) {
      if (inverse || fn) { throw new Exception('Arg not supported with multiple helpers'); }
      Utils.extend(this.helpers, name);
    } else {
      if (inverse) { fn.not = inverse; }
      this.helpers[name] = fn;
    }
  },

  registerPartial: function(name, str) {
    if (toString.call(name) === objectType) {
      Utils.extend(this.partials,  name);
    } else {
      this.partials[name] = str;
    }
  }
};

function registerDefaultHelpers(instance) {
  instance.registerHelper('helperMissing', function(arg) {
    if(arguments.length === 2) {
      return undefined;
    } else {
      throw new Exception("Missing helper: '" + arg + "'");
    }
  });

  instance.registerHelper('blockHelperMissing', function(context, options) {
    var inverse = options.inverse || function() {}, fn = options.fn;

    if (isFunction(context)) { context = context.call(this); }

    if(context === true) {
      return fn(this);
    } else if(context === false || context == null) {
      return inverse(this);
    } else if (isArray(context)) {
      if(context.length > 0) {
        return instance.helpers.each(context, options);
      } else {
        return inverse(this);
      }
    } else {
      return fn(context);
    }
  });

  instance.registerHelper('each', function(context, options) {
    var fn = options.fn, inverse = options.inverse;
    var i = 0, ret = "", data;

    if (isFunction(context)) { context = context.call(this); }

    if (options.data) {
      data = createFrame(options.data);
    }

    if(context && typeof context === 'object') {
      if (isArray(context)) {
        for(var j = context.length; i<j; i++) {
          if (data) {
            data.index = i;
            data.first = (i === 0);
            data.last  = (i === (context.length-1));
          }
          ret = ret + fn(context[i], { data: data });
        }
      } else {
        for(var key in context) {
          if(context.hasOwnProperty(key)) {
            if(data) { 
              data.key = key; 
              data.index = i;
              data.first = (i === 0);
            }
            ret = ret + fn(context[key], {data: data});
            i++;
          }
        }
      }
    }

    if(i === 0){
      ret = inverse(this);
    }

    return ret;
  });

  instance.registerHelper('if', function(conditional, options) {
    if (isFunction(conditional)) { conditional = conditional.call(this); }

    // Default behavior is to render the positive path if the value is truthy and not empty.
    // The `includeZero` option may be set to treat the condtional as purely not empty based on the
    // behavior of isEmpty. Effectively this determines if 0 is handled by the positive path or negative.
    if ((!options.hash.includeZero && !conditional) || Utils.isEmpty(conditional)) {
      return options.inverse(this);
    } else {
      return options.fn(this);
    }
  });

  instance.registerHelper('unless', function(conditional, options) {
    return instance.helpers['if'].call(this, conditional, {fn: options.inverse, inverse: options.fn, hash: options.hash});
  });

  instance.registerHelper('with', function(context, options) {
    if (isFunction(context)) { context = context.call(this); }

    if (!Utils.isEmpty(context)) return options.fn(context);
  });

  instance.registerHelper('log', function(context, options) {
    var level = options.data && options.data.level != null ? parseInt(options.data.level, 10) : 1;
    instance.log(level, context);
  });
}

var logger = {
  methodMap: { 0: 'debug', 1: 'info', 2: 'warn', 3: 'error' },

  // State enum
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  level: 3,

  // can be overridden in the host environment
  log: function(level, obj) {
    if (logger.level <= level) {
      var method = logger.methodMap[level];
      if (typeof console !== 'undefined' && console[method]) {
        console[method].call(console, obj);
      }
    }
  }
};
exports.logger = logger;
function log(level, obj) { logger.log(level, obj); }

exports.log = log;var createFrame = function(object) {
  var obj = {};
  Utils.extend(obj, object);
  return obj;
};
exports.createFrame = createFrame;
},{"./exception":3,"./utils":6}],3:[function(require,module,exports){
"use strict";

var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];

function Exception(message, node) {
  var line;
  if (node && node.firstLine) {
    line = node.firstLine;

    message += ' - ' + line + ':' + node.firstColumn;
  }

  var tmp = Error.prototype.constructor.call(this, message);

  // Unfortunately errors are not enumerable in Chrome (at least), so `for prop in tmp` doesn't work.
  for (var idx = 0; idx < errorProps.length; idx++) {
    this[errorProps[idx]] = tmp[errorProps[idx]];
  }

  if (line) {
    this.lineNumber = line;
    this.column = node.firstColumn;
  }
}

Exception.prototype = new Error();

exports["default"] = Exception;
},{}],4:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];
var COMPILER_REVISION = require("./base").COMPILER_REVISION;
var REVISION_CHANGES = require("./base").REVISION_CHANGES;

function checkRevision(compilerInfo) {
  var compilerRevision = compilerInfo && compilerInfo[0] || 1,
      currentRevision = COMPILER_REVISION;

  if (compilerRevision !== currentRevision) {
    if (compilerRevision < currentRevision) {
      var runtimeVersions = REVISION_CHANGES[currentRevision],
          compilerVersions = REVISION_CHANGES[compilerRevision];
      throw new Exception("Template was precompiled with an older version of Handlebars than the current runtime. "+
            "Please update your precompiler to a newer version ("+runtimeVersions+") or downgrade your runtime to an older version ("+compilerVersions+").");
    } else {
      // Use the embedded version info since the runtime doesn't know about this revision yet
      throw new Exception("Template was precompiled with a newer version of Handlebars than the current runtime. "+
            "Please update your runtime to a newer version ("+compilerInfo[1]+").");
    }
  }
}

exports.checkRevision = checkRevision;// TODO: Remove this line and break up compilePartial

function template(templateSpec, env) {
  if (!env) {
    throw new Exception("No environment passed to template");
  }

  // Note: Using env.VM references rather than local var references throughout this section to allow
  // for external users to override these as psuedo-supported APIs.
  var invokePartialWrapper = function(partial, name, context, helpers, partials, data) {
    var result = env.VM.invokePartial.apply(this, arguments);
    if (result != null) { return result; }

    if (env.compile) {
      var options = { helpers: helpers, partials: partials, data: data };
      partials[name] = env.compile(partial, { data: data !== undefined }, env);
      return partials[name](context, options);
    } else {
      throw new Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
    }
  };

  // Just add water
  var container = {
    escapeExpression: Utils.escapeExpression,
    invokePartial: invokePartialWrapper,
    programs: [],
    program: function(i, fn, data) {
      var programWrapper = this.programs[i];
      if(data) {
        programWrapper = program(i, fn, data);
      } else if (!programWrapper) {
        programWrapper = this.programs[i] = program(i, fn);
      }
      return programWrapper;
    },
    merge: function(param, common) {
      var ret = param || common;

      if (param && common && (param !== common)) {
        ret = {};
        Utils.extend(ret, common);
        Utils.extend(ret, param);
      }
      return ret;
    },
    programWithDepth: env.VM.programWithDepth,
    noop: env.VM.noop,
    compilerInfo: null
  };

  return function(context, options) {
    options = options || {};
    var namespace = options.partial ? options : env,
        helpers,
        partials;

    if (!options.partial) {
      helpers = options.helpers;
      partials = options.partials;
    }
    var result = templateSpec.call(
          container,
          namespace, context,
          helpers,
          partials,
          options.data);

    if (!options.partial) {
      env.VM.checkRevision(container.compilerInfo);
    }

    return result;
  };
}

exports.template = template;function programWithDepth(i, fn, data /*, $depth */) {
  var args = Array.prototype.slice.call(arguments, 3);

  var prog = function(context, options) {
    options = options || {};

    return fn.apply(this, [context, options.data || data].concat(args));
  };
  prog.program = i;
  prog.depth = args.length;
  return prog;
}

exports.programWithDepth = programWithDepth;function program(i, fn, data) {
  var prog = function(context, options) {
    options = options || {};

    return fn(context, options.data || data);
  };
  prog.program = i;
  prog.depth = 0;
  return prog;
}

exports.program = program;function invokePartial(partial, name, context, helpers, partials, data) {
  var options = { partial: true, helpers: helpers, partials: partials, data: data };

  if(partial === undefined) {
    throw new Exception("The partial " + name + " could not be found");
  } else if(partial instanceof Function) {
    return partial(context, options);
  }
}

exports.invokePartial = invokePartial;function noop() { return ""; }

exports.noop = noop;
},{"./base":2,"./exception":3,"./utils":6}],5:[function(require,module,exports){
"use strict";
// Build out our basic SafeString type
function SafeString(string) {
  this.string = string;
}

SafeString.prototype.toString = function() {
  return "" + this.string;
};

exports["default"] = SafeString;
},{}],6:[function(require,module,exports){
"use strict";
/*jshint -W004 */
var SafeString = require("./safe-string")["default"];

var escape = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;"
};

var badChars = /[&<>"'`]/g;
var possible = /[&<>"'`]/;

function escapeChar(chr) {
  return escape[chr] || "&amp;";
}

function extend(obj, value) {
  for(var key in value) {
    if(Object.prototype.hasOwnProperty.call(value, key)) {
      obj[key] = value[key];
    }
  }
}

exports.extend = extend;var toString = Object.prototype.toString;
exports.toString = toString;
// Sourced from lodash
// https://github.com/bestiejs/lodash/blob/master/LICENSE.txt
var isFunction = function(value) {
  return typeof value === 'function';
};
// fallback for older versions of Chrome and Safari
if (isFunction(/x/)) {
  isFunction = function(value) {
    return typeof value === 'function' && toString.call(value) === '[object Function]';
  };
}
var isFunction;
exports.isFunction = isFunction;
var isArray = Array.isArray || function(value) {
  return (value && typeof value === 'object') ? toString.call(value) === '[object Array]' : false;
};
exports.isArray = isArray;

function escapeExpression(string) {
  // don't escape SafeStrings, since they're already safe
  if (string instanceof SafeString) {
    return string.toString();
  } else if (!string && string !== 0) {
    return "";
  }

  // Force a string conversion as this will be done by the append regardless and
  // the regex test will do this transparently behind the scenes, causing issues if
  // an object's to string has escaped characters in it.
  string = "" + string;

  if(!possible.test(string)) { return string; }
  return string.replace(badChars, escapeChar);
}

exports.escapeExpression = escapeExpression;function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  } else if (isArray(value) && value.length === 0) {
    return true;
  } else {
    return false;
  }
}

exports.isEmpty = isEmpty;
},{"./safe-string":5}],7:[function(require,module,exports){
// Create a simple path alias to allow browserify to resolve
// the runtime on a supported path.
module.exports = require('./dist/cjs/handlebars.runtime');

},{"./dist/cjs/handlebars.runtime":1}],8:[function(require,module,exports){
module.exports = require("handlebars/runtime")["default"];

},{"handlebars/runtime":7}],9:[function(require,module,exports){
module.exports = {
  about: 'I am a software engineer based in Paris, France specialized in web development and currently working at KDS, a European travel and expense management software company. I have a passion for computer science, user experience and UI design. I graduated from an information technology engineering degree at the ITESM (Mexico) and went on to study a Master of Science program on distributed systems at Télécom ParisTech (France).',
  tools: 'I write front-end web applications with Backbone and Marionette. I use CSS pre-processors like LESS, industrialization tools like Grunt and Bower, and test frameworks like Mocha. Regarding the back-end, I use Node JS Express framework with MongoDB and I am also familiar with Django (Python) and .NET (C#). I have some experience developing native iOS applications (Objective-C).',
  other: 'As for non-computer-related activities, I love listening to music and playing guitar, bass and drums. I also consider myself a shutterbug and try to take my camera wherever I go.',
  site: 'This site is built using Backbone and Marionette. The front-end was coded with Coffeescript using Browserify for dependencies and Handlebars for templating. The back-end is built with Node JS\' Express framework. It is all hosted in Heroku'
};


},{}],10:[function(require,module,exports){
module.exports = {
  about: 'These are some non-software related things I do on my free time.',
  items: [
    {
      name: 'Change of gear',
      description: '',
      url: 'https://www.youtube.com/watch?v=QyIU21ZvZ0k',
      image: './index/img/hobbies/changeOfGear.jpg'
    }, {
      name: 'Unstoppable reality',
      description: '',
      url: 'https://www.youtube.com/watch?v=fo-YDQFLHBo',
      image: './index/img/hobbies/unstoppableReality.jpg'
    }, {
      name: 'Photography',
      description: '',
      image: './index/img/hobbies/photography.jpg',
      url: 'https://www.flickr.com/photos/125619544@N07/'
    }
  ]
};


},{}],11:[function(require,module,exports){
module.exports = {
  about: 'These are some of the projects I\'ve worked on. I try to update this section regularly, but if you want to talk about a project that is not listed here, feel free to drop me a line.',
  items: [
    {
      name: 'KDS Neo Expense',
      description: 'As a software engineer for KDS I participated in the development of this web application for on-the-fly travel expense management.',
      url: 'http://www.kds.com/kds-neo-expense',
      image: './index/img/work/neoExpense.jpg'
    }, {
      name: 'KDS Neo Travel',
      description: 'As a software engineer for KDS I participated in the developmen of this award winning web application for corporate door-to-door travel.',
      url: 'http://www.kds.com/travel-management',
      image: './index/img/work/neoTravel.jpg'
    }, {
      name: 'Pizzicato.js',
      description: 'Pizzicato.js is a library to create and manipulate sounds easily with web audio.',
      image: './index/img/work/Pizzicato.jpg',
      url: 'alemangui.github.io/pizzicato'
    }, {
      name: 'OECD Communications Outlook 2011',
      description: 'I worked with the Information, Computer and Communication Policy Committee of the OECD on Chapter 5 (Internet Infrastructure) of the Communications Outlook – a publication that covers developments in the information and communcation sector',
      image: './index/img/work/Outlook.jpg',
      url: 'http://www.oecd.org/internet/broadband/oecdcommunicationsoutlook2011.htm'
    }, {
      name: 'Internet Intermediaries OECD publication',
      description: 'During my internship at the OECD, I contributed on a workshop on "The role of Internet Intermediaries in Advancing Public Policy Objectives" supported by the Norwegian Government. The publication "The Role of Internet Intermediaries in Advancing Public Policy Objectives" resulted from this event.',
      url: 'http://www.oecd.org/sti/ieconomy/theroleofinternetintermediariesinadvancingpublicpolicyobjectives.htm',
      image: './index/img/work/Intermediaries.jpg'
    }, {
      name: 'Divento London city guide',
      description: 'I developed an iOS native application for a European ticketing company aimed to help tourists in London. The application included offline maps, audio guides, itineraries, and other features.',
      url: 'http://enapp.appvv.com/442399.html',
      image: './index/img/work/Divento.jpg'
    }, {
      name: 'Merkator',
      description: 'Merkator is a project made at Télécom Paris-Tech during my Master\'s programme aimed at providing geolocation functionalities. The web-based application allows users to locate other people connected to the same application on a map.',
      image: './index/img/work/Merkator.jpg'
    }, {
      name: 'Object Visualizer',
      description: 'This project was made as part of my Master\'s degree and consists of a tool for visualizing and modifying distributed Java objects being run on a separate JVMs. We decided to use Prefuse to build the interactive visualization elements.',
      image: './index/img/work/ObjectVisualizer.jpg'
    }, {
      name: 'Website of Aregala México',
      description: 'Aregala is a not-for-profit gastronomy association based in Peru that incorporates chefs and schools worldwide. I developed the website for their Mexico branch as a freelance project. The website is no longer available since the national branches merged into one international organisation.',
      image: './index/img/work/Aregala.jpg'
    }
  ]
};


},{}],12:[function(require,module,exports){
var MainLayout;

MainLayout = require('./layouts/MainLayout.coffee');

$(document).ready(function() {
  var mainLayout;
  mainLayout = new MainLayout;
  mainLayout.render();
  return window.scrollReveal = new scrollReveal;
});


},{"./layouts/MainLayout.coffee":14}],13:[function(require,module,exports){
var Data, HobbiesItemView, HobbiesLayout, Template,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Template = require('../../templates/Hobbies.hbs');

Data = require('../data/hobbies.coffee');

HobbiesItemView = require('../views/HobbiesItem.coffee');

HobbiesLayout = (function(_super) {
  __extends(HobbiesLayout, _super);

  function HobbiesLayout() {
    return HobbiesLayout.__super__.constructor.apply(this, arguments);
  }

  HobbiesLayout.prototype.template = Template;

  HobbiesLayout.prototype.regions = {
    grid: '.grid'
  };

  HobbiesLayout.prototype.initialize = function() {
    return this.model = new Backbone.Model(Data);
  };

  HobbiesLayout.prototype.onRender = function() {
    return this.grid.show(this.getGridView());
  };

  HobbiesLayout.prototype.getGridView = function() {
    var collection, gridView;
    collection = this.model.get('items');
    gridView = Backbone.Marionette.CollectionView.extend({
      collection: new Backbone.Collection(collection),
      itemView: HobbiesItemView
    });
    return new gridView;
  };

  return HobbiesLayout;

})(Backbone.Marionette.Layout);

module.exports = HobbiesLayout;


},{"../../templates/Hobbies.hbs":23,"../data/hobbies.coffee":10,"../views/HobbiesItem.coffee":19}],14:[function(require,module,exports){
var AboutView, HobbiesView, HomeView, MainLayout, Template, WorkView,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Template = require('../../templates/MainLayout.hbs');

HomeView = require('../views/Home.coffee');

AboutView = require('../views/About.coffee');

WorkView = require('../layouts/WorkLayout.coffee');

HobbiesView = require('../layouts/HobbiesLayout.coffee');

MainLayout = (function(_super) {
  __extends(MainLayout, _super);

  function MainLayout() {
    return MainLayout.__super__.constructor.apply(this, arguments);
  }

  MainLayout.prototype.el = $('#container');

  MainLayout.prototype.template = Template;

  MainLayout.prototype.regions = {
    home: '#home',
    about: '#about',
    work: '#work',
    hobbies: '#hobbies'
  };

  MainLayout.prototype.onRender = function() {
    this.home.show(this.getHomeView());
    this.about.show(this.getAboutView());
    this.work.show(this.getWorkView());
    return this.hobbies.show(this.getHobbiesView());
  };

  MainLayout.prototype.navigateTo = function(region) {
    var y;
    if (!this[region]) {
      return;
    }
    y = this[region].$el.offset().top;
    return $('html, body').animate({
      scrollTop: y
    });
  };

  MainLayout.prototype.getHomeView = function() {
    var homeView;
    homeView = new HomeView;
    this.listenTo(homeView, 'navigateTo', this.navigateTo);
    return homeView;
  };

  MainLayout.prototype.getAboutView = function() {
    var aboutView;
    aboutView = new AboutView;
    return aboutView;
  };

  MainLayout.prototype.getWorkView = function() {
    var workView;
    workView = new WorkView;
    return workView;
  };

  MainLayout.prototype.getHobbiesView = function() {
    var hobbiesView;
    hobbiesView = new HobbiesView;
    return hobbiesView;
  };

  return MainLayout;

})(Backbone.Marionette.Layout);

module.exports = MainLayout;


},{"../../templates/MainLayout.hbs":26,"../layouts/HobbiesLayout.coffee":13,"../layouts/WorkLayout.coffee":15,"../views/About.coffee":17,"../views/Home.coffee":20}],15:[function(require,module,exports){
var Data, Template, WorkItemView, WorkLayout,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Template = require('../../templates/Work.hbs');

Data = require('../data/work.coffee');

WorkItemView = require('../views/WorkItem.coffee');

WorkLayout = (function(_super) {
  __extends(WorkLayout, _super);

  function WorkLayout() {
    return WorkLayout.__super__.constructor.apply(this, arguments);
  }

  WorkLayout.prototype.template = Template;

  WorkLayout.prototype.regions = {
    grid: '.grid'
  };

  WorkLayout.prototype.initialize = function() {
    return this.model = new Backbone.Model(Data);
  };

  WorkLayout.prototype.onRender = function() {
    return this.grid.show(this.getGridView());
  };

  WorkLayout.prototype.getGridView = function() {
    var collection, gridView;
    collection = this.model.get('items');
    gridView = Backbone.Marionette.CollectionView.extend({
      collection: new Backbone.Collection(collection),
      itemView: WorkItemView
    });
    return new gridView;
  };

  return WorkLayout;

})(Backbone.Marionette.Layout);

module.exports = WorkLayout;


},{"../../templates/Work.hbs":27,"../data/work.coffee":11,"../views/WorkItem.coffee":21}],16:[function(require,module,exports){
var MailRequestModel,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

MailRequestModel = (function(_super) {
  __extends(MailRequestModel, _super);

  function MailRequestModel() {
    return MailRequestModel.__super__.constructor.apply(this, arguments);
  }

  MailRequestModel.prototype.url = 'api/mailRequest';

  MailRequestModel.prototype.validate = function(attributes, options) {
    var errorMessage;
    errorMessage = '';
    if (!attributes.name) {
      errorMessage += 'No sender name. ';
    }
    if (!this.isEmailAddress(attributes.email)) {
      errorMessage += 'Invaid email address. ';
    }
    if (attributes.message.length <= 0) {
      errorMessage += 'Empty message. ';
    }
    if (errorMessage.length > 0) {
      return errorMessage;
    }
  };

  MailRequestModel.prototype.isEmailAddress = function(address) {
    var regexp;
    regexp = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return address.match(regexp);
  };

  return MailRequestModel;

})(Backbone.Model);

module.exports = MailRequestModel;


},{}],17:[function(require,module,exports){
var AboutView, Data, Template,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Template = require('../../templates/About.hbs');

Data = require('../data/about.coffee');

AboutView = (function(_super) {
  __extends(AboutView, _super);

  function AboutView() {
    return AboutView.__super__.constructor.apply(this, arguments);
  }

  AboutView.prototype.template = Template;

  AboutView.prototype.initialize = function() {
    return this.model = new Backbone.Model(Data);
  };

  return AboutView;

})(Backbone.Marionette.ItemView);

module.exports = AboutView;


},{"../../templates/About.hbs":22,"../data/about.coffee":9}],18:[function(require,module,exports){
var Data, HobbiesView, Template,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Template = require('../../templates/Hobbies.hbs');

Data = require('../data/hobbies.coffee');

HobbiesView = (function(_super) {
  __extends(HobbiesView, _super);

  function HobbiesView() {
    return HobbiesView.__super__.constructor.apply(this, arguments);
  }

  HobbiesView.prototype.template = Template;

  HobbiesView.prototype.initialize = function() {
    return this.model = new Backbone.Model(Data);
  };

  return HobbiesView;

})(Backbone.Marionette.ItemView);

module.exports = HobbiesView;


},{"../../templates/Hobbies.hbs":23,"../data/hobbies.coffee":10}],19:[function(require,module,exports){
var Data, HobbyView, Template,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Template = require('../../templates/HobbiesItem.hbs');

Data = require('../data/work.coffee');

HobbyView = (function(_super) {
  __extends(HobbyView, _super);

  function HobbyView() {
    return HobbyView.__super__.constructor.apply(this, arguments);
  }

  HobbyView.prototype.template = Template;

  return HobbyView;

})(Backbone.Marionette.ItemView);

module.exports = HobbyView;


},{"../../templates/HobbiesItem.hbs":24,"../data/work.coffee":11}],20:[function(require,module,exports){
var HomeView, Template,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Template = require('../../templates/Home.hbs');

HomeView = (function(_super) {
  __extends(HomeView, _super);

  function HomeView() {
    return HomeView.__super__.constructor.apply(this, arguments);
  }

  HomeView.prototype.template = Template;

  HomeView.prototype.className = 'home-main';

  HomeView.prototype.events = {
    'click .personal-card-about': function() {
      return this.trigger('navigateTo', 'about');
    },
    'click .personal-card-work': function() {
      return this.trigger('navigateTo', 'work');
    },
    'click .personal-card-hobbies': function() {
      return this.trigger('navigateTo', 'hobbies');
    },
    'click .personal-card-contact': function() {
      return this.trigger('navigateTo', 'contact');
    }
  };

  HomeView.prototype.initialize = function() {
    this.resizeHandler = _.bind(this.onWindowSizeChanged, this);
    return $(window).on('resize', this.resizeHandler);
  };

  HomeView.prototype.onDomRefresh = function() {
    return this.onWindowSizeChanged();
  };

  HomeView.prototype.onWindowSizeChanged = function() {
    this.setTrianglifyBackround();
    return this.centerElements();
  };

  HomeView.prototype.setTrianglifyBackround = function() {
    var pattern, trianglify;
    trianglify = new Trianglify(this.trianglifyOptions);
    pattern = trianglify.generate(window.innerWidth, window.innerHeight);
    return this.$el.css({
      'background-image': pattern.dataUrl
    });
  };

  HomeView.prototype.centerElements = function() {};

  HomeView.prototype.onClose = function() {
    return $(window).off('resize', this.resizeHandler);
  };

  HomeView.prototype.trianglifyOptions = {
    x_gradient: ["#67001f", "#b2182b", "#d6604d", "#f4a582", "#fddbc7", "#f7f7f7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac", "#053061"],
    noiseIntensity: 0,
    cellsize: 90
  };

  return HomeView;

})(Backbone.Marionette.ItemView);

module.exports = HomeView;


},{"../../templates/Home.hbs":25}],21:[function(require,module,exports){
var Data, Template, WorkView,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Template = require('../../templates/WorkItem.hbs');

Data = require('../data/work.coffee');

WorkView = (function(_super) {
  __extends(WorkView, _super);

  function WorkView() {
    return WorkView.__super__.constructor.apply(this, arguments);
  }

  WorkView.prototype.template = Template;

  WorkView.prototype.ui = {
    description: '.work-item-description'
  };

  WorkView.prototype.events = {
    'click': 'onClick'
  };

  WorkView.prototype.onClick = function() {
    return this.ui.description.slideToggle();
  };

  return WorkView;

})(Backbone.Marionette.ItemView);

module.exports = WorkView;


},{"../../templates/WorkItem.hbs":28,"../data/work.coffee":11}],22:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression;


  buffer += "<div class=\"about\">\n	<i class=\"icon-child main-icon\"></i>\n	<h2 data-scroll-reveal=\"enter right\">About me</h2>\n\n	<div data-scroll-reveal=\"enter left\">\n		";
  if (helper = helpers.about) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.about); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n	</div>\n\n	<h3 data-scroll-reveal=\"enter left\">My weapons of choice</h3>\n\n	<div data-scroll-reveal=\"enter left\">\n		";
  if (helper = helpers.tools) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.tools); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n	</div>\n\n	<h3 data-scroll-reveal=\"enter left\">Other stuff I do</h3>\n\n	<div data-scroll-reveal=\"enter left\">\n		";
  if (helper = helpers.other) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.other); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n	</div>\n\n	<h3 data-scroll-reveal=\"enter left\">About this site</h3>\n\n	<div data-scroll-reveal=\"enter left\">\n		";
  if (helper = helpers.site) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.site); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n	</div>\n\n</div>";
  return buffer;
  });

},{"hbsfy/runtime":8}],23:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression;


  buffer += "<div class=\"hobbies\">\n	<i class=\"icon-note-beamed main-icon\"></i>\n	<h2 data-scroll-reveal=\"enter right\">Music and photography</h2>\n\n	<div data-scroll-reveal=\"enter left\">\n		";
  if (helper = helpers.about) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.about); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n	</div>\n\n	<div class=\"item-container clearfix grid\">\n\n	</div>\n\n</div>";
  return buffer;
  });

},{"hbsfy/runtime":8}],24:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n<a href=\"";
  if (helper = helpers.url) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.url); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" target=\"_blank\">\n";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1;
  buffer += " style=\"background-image: url("
    + escapeExpression(((stack1 = (depth0 && depth0.image)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + ")\"";
  return buffer;
  }

function program5(depth0,data) {
  
  
  return "\n</a>\n";
  }

  stack1 = helpers['if'].call(depth0, (depth0 && depth0.url), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n<div class=\"hobby-item grid-item\"";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.image), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += ">\n	<div class=\"hobby-item-name\">\n		"
    + escapeExpression(((stack1 = (depth0 && depth0.name)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\n	</div>\n</div>\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.url), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  return buffer;
  });

},{"hbsfy/runtime":8}],25:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"home\">\n\n	<div class=\"personal-card\">\n\n		<div data-scroll-reveal=\"enter top\" class=\"personal-card-photo\">\n			<img src=\"./index/img/alemangui.png\" />\n		</div>\n		<h1 class=\"personal-card-name\" data-scroll-reveal=\"enter bottom\">Alejandro Mantecón Guillén</h1>\n		<div class=\"personal-card-surname\" data-scroll-reveal=\"enter bottom\">Software engineer</div>\n\n		<div data-scroll-reveal=\"enter bottom\" class=\"personal-card-buttons\">\n\n			<div class=\"personal-card-about\">\n				<i class=\"icon-child\"></i>\n			</div>\n\n			<div class=\"personal-card-work\">\n				<i class=\"icon-code\"></i>\n			</div>\n\n			<div class=\"personal-card-hobbies\">\n				<i class=\"icon-note-beamed\"></i>\n			</div>\n\n			<div class=\"personal-card-contact\">\n				<i class=\"icon-mail\"></i>\n			</div>\n\n\n		</div>\n\n	</div>\n\n</div>";
  });

},{"hbsfy/runtime":8}],26:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div id=\"home\"></div>\n<div id=\"about\" class=\"section\"></div>\n<div id=\"work\" class=\"section\"></div>\n<div id=\"hobbies\" class=\"section\"></div>";
  });

},{"hbsfy/runtime":8}],27:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression;


  buffer += "<div class=\"work\">\n	<i class=\"icon-code main-icon\"></i>\n	<h2 data-scroll-reveal=\"enter right\">My Work</h2>\n\n	<div data-scroll-reveal=\"enter left\">\n		";
  if (helper = helpers.about) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.about); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n	</div>\n\n	<div class=\"item-container clearfix grid\">\n\n	</div>\n\n</div>";
  return buffer;
  });

},{"hbsfy/runtime":8}],28:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1;
  buffer += " style=\"background-image: url("
    + escapeExpression(((stack1 = (depth0 && depth0.image)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + ")\"";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n				<a href=\"";
  if (helper = helpers.url) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.url); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" target=\"_blank\"><button type=\"button\" class=\"description-site\">Go to site</button></a>\n			";
  return buffer;
  }

  buffer += "<div class=\"work-item grid-item\"";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.image), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += ">\n	<div class=\"work-item-name\">\n		"
    + escapeExpression(((stack1 = (depth0 && depth0.name)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\n	</div>\n	<div class=\"work-item-description\" style=\"display:none\">\n		\n		"
    + escapeExpression(((stack1 = (depth0 && depth0.description)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\n\n		<div class=\"work-item-buttons\">\n			";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.url), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n		</div>\n	</div>\n</div>";
  return buffer;
  });

},{"hbsfy/runtime":8}]},{},[9,10,11,12,13,14,15,16,17,18,19,20,21])