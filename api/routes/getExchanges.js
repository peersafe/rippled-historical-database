'use strict'

var Logger = require('../../lib/logger')
var log = new Logger({scope: 'exchanges'})
var smoment = require('../../lib/smoment')
var utils = require('../../lib/utils')
var hbase = require('../../lib/hbase')
var intervals = [
  '1minute',
  '5minute',
  '15minute',
  '30minute',
  '1hour',
  '2hour',
  '4hour',
  '1day',
  '3day',
  '7day',
  '1month',
  '1year'
]
var intervalsByMinute = [
  1,
  5,
  15,
  30,
  60,
  120,
  240,
  1440,
  4320,
  10080,
  0,
  0
]
var PRECISION = 8

function getExchanges(req, res) {
  var params

  function prepareOptions() {
    var options = {
      start: smoment(req.query.start || '2013-01-01'),
      end: smoment(req.query.end),
      interval: req.query.interval,
      limit: Number(req.query.limit || 200),
      base: {},
      counter: {},
      descending: (/true/i).test(req.query.descending) ? true : false,
      reduce: (/true/i).test(req.query.reduce) ? true : false,
      autobridged: (/true/i).test(req.query.autobridged) ? true : false,
      nofill: (/true/i).test(req.query.nofill) ? true : false,
      format: (req.query.format || 'json').toLowerCase(),
      marker: req.query.marker
    }

    var base = req.params.base.split(/[\+|\.]/) // any of +, |, or .
    var counter = req.params.counter.split(/[\+|\.]/)

    options.base.currency = base[0] ? base[0].toUpperCase() : undefined
    options.base.issuer = base[1] ? base[1] : undefined

    options.counter.currency = counter[0] ? counter[0].toUpperCase() : undefined
    options.counter.issuer = counter[1] ? counter[1] : undefined

    if (!options.base.currency) {
      return {error: 'base currency is required', code: 400}
    } else if (!options.counter.currency) {
      return {error: 'counter currency is required', code: 400}
    } else if (options.base.currency === 'ZXC' && options.base.issuer) {
      return {error: 'ZXC cannot have an issuer', code: 400}
    } else if (options.counter.currency === 'ZXC' && options.counter.issuer) {
      return {error: 'ZXC cannot have an issuer', code: 400}
    } else if (options.base.currency !== 'ZXC' && !options.base.issuer) {
      return {error: 'base issuer is required', code: 400}
    } else if (options.counter.currency !== 'ZXC' && !options.counter.issuer) {
      return {error: 'counter issuer is required', code: 400}
    }

    if (!options.start) {
      return {error: 'invalid start date format', code: 400}
    } else if (!options.end) {
      return {error: 'invalid end date format', code: 400}
    }

    if (options.interval) {
      options.interval = options.interval.toLowerCase()
    }
    if (options.interval === 'week') {
      options.interval = '7day'
    }

    if (isNaN(options.limit)) {
      return {error: 'invalid limit: ' + options.limit, code: 400}
    } else if (options.reduce && options.interval) {
      return {error: 'cannot use reduce with interval', code: 400}
    } else if (options.limit > 400) {
      options.limit = 400
    } else if (options.interval &&
               intervals.indexOf(options.interval) === -1) {
      return {error: 'invalid interval: ' + options.interval, code: 400}
    }

    return options
  }

  /**
   * formatInterval
   */

  function formatInterval(ex) {
    delete ex.rowkey
    delete ex.sort_open
    delete ex.sort_close

    if (ex.open_time) {
      ex.open_time = smoment(ex.open_time).format()
    } else {
      delete ex.open_time
    }

    if (ex.close_time) {
      ex.close_time = smoment(ex.close_time).format()
    } else {
      delete ex.close_time
    }

    ex.start = smoment(ex.start).format()
    ex.base_currency = params.base.currency
    ex.base_issuer = params.base.issuer
    ex.counter_currency = params.counter.currency
    ex.counter_issuer = params.counter.issuer
    ex.base_volume = ex.base_volume.toString()
    ex.counter_volume = ex.counter_volume.toString()
    ex.open = ex.open.toPrecision(PRECISION)
    ex.high = ex.high.toPrecision(PRECISION)
    ex.low = ex.low.toPrecision(PRECISION)
    ex.close = ex.close.toPrecision(PRECISION)
    ex.vwap = ex.vwap.toPrecision(PRECISION)
  }

  /**
   * autoFillInterval
   * return a completed response
   * @param {Object} exchanges
   */

  function autoFillInterval(resp) {
    if (params.nofill || resp.rows.length < 1) {
      return
    }
    var start = resp.rows[0].start
    var idx = intervals.indexOf(params.interval)
    var interval = intervalsByMinute[idx]
    var expectStart

    var ab = 1
    var offset = 1
    idx = 0
    if (params.descending) {
      ab = -1
      offset = 0

      if (params.interval == '1month') {
        expectStart = utils.getAlignedTime(params.end.subtractByMonth(params.limit), 'mon', 1)
      } else if (params.interval == '1year') {
        expectStart = utils.getAlignedTime(params.end.subtractByYear(params.limit), 'yea', 1)
      } else {
        expectStart = params.end.subtractByMinute(params.limit * interval)
        if (params.interval === '7day') {
          expectStart = utils.getAlignedTime(expectStart, 'day', 7)
        } else if (params.interval === '3day') {
          expectStart = utils.getAlignedTime(expectStart, 'day', 3)
        } else if (params.interval === '1day') {
          expectStart = utils.getAlignedTime(expectStart, 'day', 1)
        } else if (params.interval === '4hour') {
          expectStart = utils.getAlignedTime(expectStart, 'hou', 4)
        } else if (params.interval === '2hour') {
          expectStart = utils.getAlignedTime(expectStart, 'hou', 2)
        } else if (params.interval === '1hour') {
          expectStart = utils.getAlignedTime(expectStart, 'hou', 1)
        } else {
          expectStart = utils.getAlignedTime(expectStart, 'min', interval)
        }
      }

      if (smoment(expectStart).unix() > smoment(start).unix()) {
        start = expectStart
      }

      while (smoment(start).unix() < params.end.unix()) {
        if (params.interval == '1month') {
          expectStart = smoment(start).addByMonth(1)
        } else if (params.interval == '1year') {
          expectStart = smoment(start).addByYear(1)
        } else {
          expectStart = smoment(start).addByMinute(interval)
        }

        if (smoment(expectStart).unix() > params.end.unix()) {
          break
        }

        start = expectStart
        var ex = {
          base_volume: '0',
          buy_volume: 0,
          count: 0,
          counter_volume: '0',
          base_currency: params.base.currency,
          base_issuer: params.base.issuer,
          counter_currency: params.counter.currency,
          counter_issuer: params.counter.issuer
        }
        ex.start = expectStart
        ex.open_time = expectStart
        ex.close_time = expectStart
        ex.close = resp.rows[0].close
        ex.vwap = resp.rows[0].vwap
        ex.open = ex.close
        ex.high = ex.close
        ex.low = ex.close
        resp.rows.splice(0, 0, ex)
        idx++
      }
    }
    
    start = resp.rows[idx].start
    for (var i = idx + 1; i < resp.rows.length; i++) {
      if (i > params.limit) {
        resp.rows = resp.rows.slice(0, params.limit)
        break
      }
      if (params.interval == '1month') {
        expectStart = smoment(start).addByMonth(1 * ab)
      } else if (params.interval == '1year') {
        expectStart = smoment(start).addByYear(1 * ab)
      } else {
        expectStart = smoment(start).addByMinute(interval * ab)
      }

      start = resp.rows[i].start
      if (expectStart != start) {
        start = expectStart
        var ex = {
          base_volume: '0',
          buy_volume: 0,
          count: 0,
          counter_volume: '0',
          base_currency: params.base.currency,
          base_issuer: params.base.issuer,
          counter_currency: params.counter.currency,
          counter_issuer: params.counter.issuer
        }
        ex.start = expectStart
        ex.open_time = expectStart
        ex.close_time = expectStart
        ex.close = resp.rows[i-offset].close
        ex.vwap = resp.rows[i-offset].vwap
        ex.open = ex.close
        ex.high = ex.close
        ex.low = ex.close
        resp.rows.splice(i, 0, ex)
      }
    }
  }

  /**
  * errorResponse
  * return an error response
  * @param {Object} err
  */

  function errorResponse(err) {
    log.error(err.error || err)
    if (err.code && err.code.toString()[0] === '4') {
      res.status(err.code).json({
        result: 'error',
        message: err.error
      })
    } else {
      res.status(500).json({
        result: 'error',
        message: 'unable to retrieve exchanges'
      })
    }
  }

  /**
   * successResponse
   * return a successful response
   * @param {Object} exchanges
   */

  function successResponse(resp) {
    var filename

    if (resp.marker) {
      utils.addLinkHeader(req, res, resp.marker)
    }

    if (params.format === 'csv') {
      filename = 'exchanges - ' +
        params.base.currency + '-' +
        params.counter.currency +
        '.csv'

      // ensure consistent order and
      // inclusion of all fields
      if (resp.rows.length &&
         (params.reduce || params.interval)) {

        resp.rows[0] = {
          open: resp.rows[0].open,
          high: resp.rows[0].high,
          low: resp.rows[0].low,
          close: resp.rows[0].close,
          vwap: resp.rows[0].vwap,
          count: resp.rows[0].count,
          base_currency: resp.rows[0].base_currency,
          base_issuer: resp.rows[0].base_issuer,
          base_volume: resp.rows[0].base_volume,
          counter_currency: resp.rows[0].counter_currency,
          counter_issuer: resp.rows[0].counter_issuer,
          counter_volume: resp.rows[0].counter_volume,
          open_time: resp.rows[0].open_time,
          close_time: resp.rows[0].close_time,
          start: resp.rows[0].start
        }

      } else if (resp.rows.length) {
        resp.rows[0] = {
          base_currency: resp.rows[0].base_currency,
          base_issuer: resp.rows[0].base_issuer,
          base_amount: resp.rows[0].base_amount,
          counter_amount: resp.rows[0].counter_amount,
          counter_currency: resp.rows[0].counter_currency,
          counter_issuer: resp.rows[0].counter_issuer,
          rate: resp.rows[0].rate,
          executed_time: resp.rows[0].executed_time,
          ledger_index: resp.rows[0].ledger_index,
          buyer: resp.rows[0].buyer,
          seller: resp.rows[0].seller,
          taker: resp.rows[0].taker,
          provider: resp.rows[0].provider,
          autobridged_currency: resp.rows[0].autobridged_currency,
          autobridged_issuer: resp.rows[0].autobridged_issuer,
          offer_sequence: resp.rows[0].offer_sequence,
          tx_type: resp.rows[0].tx_type,
          tx_index: resp.rows[0].tx_index,
          node_index: resp.rows[0].node_index,
          tx_hash: resp.rows[0].tx_hash
        }
      }

      res.csv(resp.rows, filename)
    } else {
      res.json({
        result: 'success',
        count: resp.rows.length,
        marker: resp.marker,
        exchanges: resp.rows
      })
    }
  }

  params = prepareOptions()

  if (params.error) {
    errorResponse(params)

  } else {
    log.info(params.base.currency, params.counter.currency)

    hbase.getExchanges(params, function(err, resp) {
      if (err && err === 'too many rows') {
        errorResponse({
          code: 400,
          error: 'too many exchanges, use a smaller interval'
        })

      } else if (err) {
        errorResponse(err)

      } else if (params.reduce) {
        formatInterval(resp.reduced)
        resp.rows = [resp.reduced]
        successResponse(resp)

      } else {
        if (params.interval) {
          resp.rows.forEach(formatInterval)
          autoFillInterval(resp)

        } else {
          resp.rows.forEach(function(ex) {
            delete ex.rowkey
            delete ex.time
            delete ex.client

            ex.executed_time = smoment(ex.executed_time).format()
            ex.base_currency = params.base.currency
            ex.base_issuer = params.base.issuer
            ex.counter_currency = params.counter.currency
            ex.counter_issuer = params.counter.issuer
            ex.base_amount = ex.base_amount.toString()
            ex.counter_amount = ex.counter_amount.toString()
            ex.rate = ex.rate.toPrecision(PRECISION)
          })
        }

        successResponse(resp)
      }
    })
  }
}


module.exports = getExchanges
